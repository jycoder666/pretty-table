import { beforeEach, describe, expect, it, vi } from 'vitest'
import { set as idbSet } from 'idb-keyval'
import { COMPARE_ALPHA_V1, cloneInstance, type TemplateInstance } from '@/core'
import { createIdbTemplateRepo } from './idbTemplateRepo'
import { kvStore } from './kvStore'
import { SEED_TEMPLATES, ensureSeeded } from './seedTemplates'

/**
 * 内置需求表自动播种（tables/*.json →「我的模板」）：
 * - 首次播种 16 张（2026-11-12 起 tables/ 16 张）、显示名=中文文件名去扩展名
 * - 刷新（再次 ensureSeeded）不重复种
 * - 用户删除某张种子表后不复活（注册键 seed:v3:<templateId> 仍在；v3 = schema 1.3 复刻版升级戳）
 * - 用户库已有同 id 模板（跨机导入）不被覆盖
 * idb-keyval 以内存 Map 模拟（与 idbTemplateRepo.spec.ts 同款），
 * import.meta.glob 经 vitest 真实加载 tables/ 下 16 张 JSON。
 */

const { mem, memOf } = vi.hoisted(() => {
  // store 感知的内存模拟：每个 createStore() 实例独立命名空间，未传 store 落默认库——
  // 防「set 漏传 kvStore 写错库」类 P0 回归（2026-11-08 冒烟实测教训）
  const defaultStore: object = { __default: true }
  const spaces = new Map<object, Map<string, unknown>>()
  const spaceOf = (store?: object) => {
    const key = store ?? defaultStore
    let m = spaces.get(key)
    if (!m) {
      m = new Map<string, unknown>()
      spaces.set(key, m)
    }
    return m
  }
  return {
    mem: spaceOf(),
    memOf: spaceOf,
  }
})

vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  get: vi.fn(async (key: string, store?: object) => memOf(store).get(key)),
  set: vi.fn(async (key: string, val: unknown, store?: object) => {
    memOf(store).set(key, val)
  }),
  del: vi.fn(async (key: string, store?: object) => {
    memOf(store).delete(key)
  }),
  keys: vi.fn(async (store?: object) => [...memOf(store).keys()]),
}))

const SEED_FILE_NAMES = [
  '三年级2班课程表',
  '三款机型参数对比',
  '产品改版排期',
  '十月·家庭收支账',
  '大理四天三晚行程',
  '年度体检·指标解读',
  '百万医疗险·横向测评',
  '餐厅秋季菜单',
  // 2026-11-12 批：table2 设计稿 4 张（训练/账本/淘汰赛/打卡）
  '推拉腿·四分化训练',
  '十月·家庭账本',
  '城市杯·八强淘汰赛',
  '二十一天·习惯打卡',
  // 2026-11-12 批：table3 设计稿 4 张（报价/排班/成绩/库存）
  '设计服务报价单',
  '门店十一月排班表',
  '秋季学期成绩报告单',
  '库存与补货清单',
]

function seedKeys(): string[] {
  return [...memOf(kvStore).keys()].filter((k) => k.startsWith('seed:v3:'))
}

function userTemplate(id: string, name: string): TemplateInstance {
  const inst = cloneInstance(COMPARE_ALPHA_V1)
  inst.templateId = id
  inst.meta = { ...inst.meta, displayName: name, origin: 'user', savedAt: new Date().toISOString() }
  return inst
}

beforeEach(() => {
  mem.clear()
  memOf(kvStore).clear()
  vi.clearAllMocks()
})

describe('seedTemplates · 内置需求表自动播种', () => {
  it('glob 收集：tables/ 下 16 张表全部合法，显示名=文件名去扩展名（P6 懒加载后经 ensureSeeded 触发）', async () => {
    // P6：glob 改 eager:false，种子清单在首次 ensureSeeded 时动态加载填充
    await ensureSeeded()
    expect(SEED_TEMPLATES).toHaveLength(16)
    expect(SEED_TEMPLATES.map((s) => s.fileName).sort()).toEqual([...SEED_FILE_NAMES].sort())
    for (const s of SEED_TEMPLATES) {
      expect(s.instance.templateId).toMatch(/^user-/)
    }
  })

  it('首次播种：空库 ensureSeeded 后「我的模板」出现 16 张，displayName 为文件名，注册键齐全', async () => {
    await ensureSeeded()
    const repo = createIdbTemplateRepo()
    const list = await repo.list()
    expect(list).toHaveLength(16)
    expect(list.map((t) => t.meta?.displayName ?? '').sort()).toEqual([...SEED_FILE_NAMES].sort())
    expect(seedKeys()).toHaveLength(16)
    // 播种实例可再读回（repo.list 内 validate+migrate 通过）
    expect(list.every((t) => t.schemaVersion === '1.3')).toBe(true)
    // 防回退（P0 教训 2026-11-08）：所有播种写入必须落在应用库 kvStore，
    // 默认库（漏传 store 参数时的去处）必须保持零键
    expect(mem.size).toBe(0)
    expect(memOf(kvStore).size).toBe(32)
  })

  it('刷新不重复种：第二次 ensureSeeded 零写入，列表仍 16 张', async () => {
    await ensureSeeded()
    const writesAfterFirst = vi.mocked(idbSet).mock.calls.length
    await ensureSeeded()
    expect(vi.mocked(idbSet).mock.calls.length).toBe(writesAfterFirst)
    const repo = createIdbTemplateRepo()
    expect(await repo.list()).toHaveLength(16)
  })

  it('删除后不复活：remove 只删 tpl: 键，注册键仍在，再播种不写回', async () => {
    await ensureSeeded()
    const target = SEED_TEMPLATES[0]!
    const repo = createIdbTemplateRepo()
    await repo.remove(target.instance.templateId)
    const writesAfterRemove = vi.mocked(idbSet).mock.calls.length
    await ensureSeeded()
    expect(vi.mocked(idbSet).mock.calls.length).toBe(writesAfterRemove)
    expect(await repo.get(target.instance.templateId)).toBeNull()
    const list = await repo.list()
    expect(list).toHaveLength(15)
    expect(list.map((t) => t.meta?.displayName)).not.toContain(target.fileName)
  })

  it('首次播种覆盖同 id 旧模板：等同用户手动初创建，此后注册键保护用户编辑/删除', async () => {
    const target = SEED_TEMPLATES[1]!
    const foreign = userTemplate(target.instance.templateId, '我的跨机导入版')
    memOf(kvStore).set('tpl:' + foreign.templateId, foreign)
    await ensureSeeded()
    const repo = createIdbTemplateRepo()
    // 覆盖为种子内容（用户拍板 2026-11-08：首次播种等同手动初创建）
    const got = await repo.get(target.instance.templateId)
    expect(got?.meta?.displayName).toBe(target.fileName)
    expect(seedKeys()).toContain('seed:v3:' + target.instance.templateId)
    // 注册键落地：后续 ensureSeeded 零写入，用户编辑/删除不受影响
    const writesAfterFirst = vi.mocked(idbSet).mock.calls.length
    await ensureSeeded()
    expect(vi.mocked(idbSet).mock.calls.length).toBe(writesAfterFirst)
    const again = await repo.get(target.instance.templateId)
    expect(again?.meta?.displayName).toBe(target.fileName)
  })
})
