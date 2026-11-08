import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COMPARE_ALPHA_V1, cloneInstance, type TemplateInstance } from '@/core'
import { createIdbTemplateRepo } from './idbTemplateRepo'

/**
 * FR-C4「读时迁移」闭环：idbTemplateRepo 读回（list/get）统一 migrate 到当前版本。
 * idb-keyval 以内存 Map 模拟（等价持久化语义，jsdom 无 indexedDB）。
 */

const { mem, quotaSet, quotaDel } = vi.hoisted(() => ({
  mem: new Map<string, unknown>(),
  quotaSet: { on: false },
  quotaDel: { on: false },
}))

vi.mock('idb-keyval', () => ({
  createStore: vi.fn<() => object>(() => ({})),
  get: vi.fn<(key: string) => Promise<unknown>>(async (key: string) => mem.get(key)),
  set: vi.fn<(key: string, val: unknown) => Promise<void>>(async (key: string, val: unknown) => {
    // P1 quota 用例开关：打开后模拟浏览器配额溢出
    if (quotaSet.on) {
      throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
    }
    mem.set(key, val)
  }),
  del: vi.fn<(key: string) => Promise<void>>(async (key: string) => {
    if (quotaDel.on) {
      throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
    }
    mem.delete(key)
  }),
  keys: vi.fn<() => Promise<string[]>>(async () => [...mem.keys()]),
}))

function legacyUserTemplate(
  id: string,
  schemaVersion: '1.0' | '1.1' | '1.2',
): TemplateInstance {
  const inst = cloneInstance(COMPARE_ALPHA_V1)
  inst.schemaVersion = schemaVersion
  inst.templateId = id
  inst.meta = {
    ...inst.meta,
    displayName: `旧模板 ${id}`,
    origin: 'user',
    savedAt: new Date().toISOString(),
  }
  return inst
}

beforeEach(() => {
  mem.clear()
  quotaSet.on = false
  quotaDel.on = false
})

describe('idbTemplateRepo · 读时迁移（FR-C4 闭环）', () => {
  it('list：1.1 旧「我的模板」读回统一为 1.2，槽位内容与结构保真', async () => {
    const repo = createIdbTemplateRepo()
    await repo.save(legacyUserTemplate('user-legacy-1', '1.1'))
    const out = await repo.list()
    expect(out).toHaveLength(1)
    expect(out[0]!.schemaVersion).toBe('1.2')
    expect(out[0]!.templateId).toBe('user-legacy-1')
    expect(out[0]!.slots['obj.name.a']).toBe('方案 A')
    expect(out[0]!.meta?.origin).toBe('user')
  })

  it('get：1.0 更旧版本读回同样迁移到 1.2', async () => {
    const repo = createIdbTemplateRepo()
    await repo.save(legacyUserTemplate('user-legacy-0', '1.0'))
    const got = await repo.get('user-legacy-0')
    expect(got).not.toBeNull()
    expect(got!.schemaVersion).toBe('1.2')
  })

  it('list/get 对已是当前版本的实例幂等（再读不变）', async () => {
    const repo = createIdbTemplateRepo()
    await repo.save(legacyUserTemplate('user-cur', '1.2'))
    const once = await repo.get('user-cur')
    expect(once!.schemaVersion).toBe('1.2')
    const list = await repo.list()
    expect(list[0]!.schemaVersion).toBe('1.2')
  })

  it('重命名 round-trip（PX-10）：同名键覆盖 save 后 get/list 读回新名字，其余字段保真', async () => {
    const repo = createIdbTemplateRepo()
    await repo.save(legacyUserTemplate('user-rn', '1.2'))
    // 重命名 = 原实例改 meta.displayName 后原键覆盖 save
    const cur = (await repo.get('user-rn'))!
    const renamed = JSON.parse(JSON.stringify(cur)) as TemplateInstance
    renamed.meta = { ...renamed.meta, displayName: '体检对比·终版' }
    await repo.save(renamed)
    // list 读回：新名字生效，仍只有一张卡，内容未丢
    const list = await repo.list()
    expect(list).toHaveLength(1)
    expect(list[0]!.templateId).toBe('user-rn')
    expect(list[0]!.meta?.displayName).toBe('体检对比·终版')
    expect(list[0]!.slots['obj.name.a']).toBe('方案 A')
    // get 读回：同样生效
    const got = await repo.get('user-rn')
    expect(got!.meta?.displayName).toBe('体检对比·终版')
    expect(got!.schemaVersion).toBe('1.2')
  })

  it('list 跳过校验不过的坏数据，不抛错不中断其他条目', async () => {
    const repo = createIdbTemplateRepo()
    await repo.save(legacyUserTemplate('user-ok', '1.1'))
    mem.set('tpl:tpl:bad', { foo: 'not-a-template' })
    const out = await repo.list()
    expect(out).toHaveLength(1)
    expect(out[0]!.templateId).toBe('user-ok')
    expect(await repo.get('tpl:bad')).toBeNull()
  })
})

describe('idbTemplateRepo · P1 配额溢出归一（QuotaExceededError → reason:quota）', () => {
  it('save 遇 QuotaExceededError → 抛 TEMPLATE_SAVE_FAIL + reason:quota（激活 EditorPage「已满」分支）', async () => {
    const repo = createIdbTemplateRepo()
    quotaSet.on = true
    await expect(repo.save(legacyUserTemplate('user-q1', '1.2'))).rejects.toMatchObject({
      code: 'TEMPLATE_SAVE_FAIL',
      message: '浏览器存储空间已满，无法保存',
      details: { reason: 'quota' },
    })
  })

  it('remove 遇 QuotaExceededError → 抛 TEMPLATE_DELETE_FAIL + reason:quota；其它异常原样上抛', async () => {
    const repo = createIdbTemplateRepo()
    quotaDel.on = true
    await expect(repo.remove('user-x')).rejects.toMatchObject({
      code: 'TEMPLATE_DELETE_FAIL',
      details: { reason: 'quota' },
    })
    // 非 quota 异常（如读写底层故障）不得被吞成 quota：关掉开关后 del 正常
    quotaDel.on = false
    await expect(repo.remove('user-x')).resolves.toBeUndefined()
  })
})
