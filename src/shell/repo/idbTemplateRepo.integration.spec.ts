import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { COMPARE_ALPHA_V1, cloneInstance, type TemplateInstance } from '@/core'
import type { TemplateRepo } from './templateRepo'

/**
 * C1 测试债收口：idbTemplateRepo 跑在真实 IndexedDB 语义上（fake-indexeddb）。
 *
 * 接线方案（偏差登记）：devDependencies 已有 fake-indexeddb 6.0.0 但未接线。现有
 * 491 条用例大量 vi.mock('idb-keyval')，若在 vitest setupFiles 里全局
 * import 'fake-indexeddb/auto'，线程池同 worker 的全局 indexedDB 会跨测试文件
 * 泄漏，侵入面大。这里选「仅本文件局部接线」：beforeAll 先把全局 indexedDB 换成
 * fake 工厂，再动态 import 被测模块（kvStore 的 createStore 在模块求值时即 open，
 * 必须晚于工厂安装），afterAll 还原全局。vitest 各 spec 文件模块图相互隔离，
 * 现有用例零感知。
 */

const T04_IMG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

let repo!: TemplateRepo
let idb!: typeof import('idb-keyval')
let kvStore!: import('idb-keyval').UseStore
let prevIdb: unknown

beforeAll(async () => {
  prevIdb = (globalThis as { indexedDB?: unknown }).indexedDB
  ;(globalThis as { indexedDB?: unknown }).indexedDB = new IDBFactory()
  idb = await import('idb-keyval')
  kvStore = (await import('./kvStore')).kvStore
  repo = (await import('./idbTemplateRepo')).createIdbTemplateRepo()
})

afterAll(() => {
  // 还原全局，杜绝同 worker 后续文件感知（现有用例均 mock idb-keyval，此为双保险）
  ;(globalThis as { indexedDB?: unknown }).indexedDB = prevIdb
})

beforeEach(async () => {
  // 每条用例独享干净库：清空全部键（tpl:* / draft:* 都不留）
  await idb.clear(kvStore)
})

/** 构造一份合法的用户模板实例（默认 1.2，可带图片槽） */
function userTemplate(
  id: string,
  schemaVersion: '1.0' | '1.1' | '1.2' = '1.2',
  withImage = false,
): TemplateInstance {
  const inst = cloneInstance(COMPARE_ALPHA_V1)
  inst.schemaVersion = schemaVersion
  inst.templateId = id
  inst.meta = {
    ...inst.meta,
    displayName: `真库模板 ${id}`,
    origin: 'user',
    savedAt: '2026-01-01T00:00:00.000Z',
  }
  if (withImage) inst.slots['row.3.val.a'] = { image: T04_IMG }
  return inst
}

describe('idbTemplateRepo · 真实 IndexedDB（fake-indexeddb）持久化', () => {
  it('save/list round-trip：schema 1.2 实例含图片 data URL 读写保真', async () => {
    await repo.save(userTemplate('it-img', '1.2', true))
    const out = await repo.list()
    expect(out).toHaveLength(1)
    const got = out[0]!
    expect(got.schemaVersion).toBe('1.2')
    expect(got.templateId).toBe('it-img')
    expect(got.meta?.displayName).toBe('真库模板 it-img')
    expect(got.meta?.origin).toBe('user')
    // 图片 data URL 逐字符保真（IndexedDB structuredClone 对字符串无损）
    expect(got.slots['row.3.val.a']).toEqual({ image: T04_IMG })
    // 其余槽位与结构不受图片槽影响
    expect(got.slots['obj.name.a']).toBe('方案 A')
    expect(got.layout.colCount).toBe(COMPARE_ALPHA_V1.layout.colCount)
  })

  it('get：单取 round-trip，图片槽 / 文字槽 / 区块逐字段一致', async () => {
    const src = userTemplate('it-get', '1.2', true)
    await repo.save(src)
    const got = await repo.get('it-get')
    expect(got).not.toBeNull()
    expect(got!.slots['row.3.val.a']).toEqual({ image: T04_IMG })
    expect(got!.slots['obj.name.a']).toEqual(src.slots['obj.name.a'])
    expect(got!.blocks).toEqual(src.blocks)
    expect(got!.themeId).toBe(src.themeId)
  })

  it('remove：删除后 list/get 均消失，另一条不受影响', async () => {
    await repo.save(userTemplate('it-keep'))
    await repo.save(userTemplate('it-gone'))
    await repo.remove('it-gone')
    const out = await repo.list()
    expect(out).toHaveLength(1)
    expect(out[0]!.templateId).toBe('it-keep')
    expect(await repo.get('it-gone')).toBeNull()
  })

  it('rename round-trip（PX-10）：原键覆盖 save，list/get 读回新名字、内容不丢', async () => {
    await repo.save(userTemplate('it-rn'))
    const cur = (await repo.get('it-rn'))!
    const renamed = JSON.parse(JSON.stringify(cur)) as TemplateInstance
    renamed.meta = { ...renamed.meta, displayName: '体检对比·终版' }
    await repo.save(renamed)
    const list = await repo.list()
    expect(list).toHaveLength(1)
    expect(list[0]!.templateId).toBe('it-rn')
    expect(list[0]!.meta?.displayName).toBe('体检对比·终版')
    expect(list[0]!.slots['obj.name.a']).toBe('方案 A')
    expect((await repo.get('it-rn'))!.meta?.displayName).toBe('体检对比·终版')
  })

  it('读时迁移（FR-C4）：1.1 旧实例经真实库读回统一为 1.2', async () => {
    await repo.save(userTemplate('it-legacy', '1.1'))
    const got = await repo.get('it-legacy')
    expect(got).not.toBeNull()
    expect(got!.schemaVersion).toBe('1.2')
    expect(got!.slots['obj.name.a']).toBe('方案 A')
    const list = await repo.list()
    expect(list[0]!.schemaVersion).toBe('1.2')
  })

  it('坏数据跳过：list 容错不抛错、好数据不受牵连；get 对坏键返回 null', async () => {
    await repo.save(userTemplate('it-ok'))
    // 绕过 repo.save 直接写两条坏数据：全然不合法 / 缺 layout
    await idb.set('tpl:bad-freeform', { foo: 'not-a-template' }, kvStore)
    await idb.set(
      'tpl:bad-missing-layout',
      { templateId: 'bad-2', slots: {}, blocks: [], themeId: 'T-A' },
      kvStore,
    )
    const out = await repo.list()
    expect(out).toHaveLength(1)
    expect(out[0]!.templateId).toBe('it-ok')
    expect(await repo.get('bad-freeform')).toBeNull()
    expect(await repo.get('bad-missing-layout')).toBeNull()
  })
})
