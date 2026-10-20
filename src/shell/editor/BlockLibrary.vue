<script setup lang="ts">
import { useEditorStore } from '../stores/editor'
import BlockDraggable from '../dnd/BlockDraggable.vue'
import { usePlaceSession } from '../dnd/placeSession'
import type { BlockType } from '@/core'

const editor = useEditorStore()
const session = usePlaceSession()

const items: Array<{ type: BlockType; label: string; enabled: boolean; hint: string }> = [
  {
    type: 'sectionBar',
    label: '分区色条',
    enabled: true,
    hint: '拖入表内虚线槽，或 Enter / 点击进入待放置后选槽',
  },
  {
    type: 'groupHeader',
    label: '分组标题行',
    enabled: true,
    hint: '拖入表内虚线槽，或 Enter / 点击进入待放置后选槽',
  },
  { type: 'emphFooter', label: '强调注脚', enabled: false, hint: '二期开放' },
  { type: 'leftTag', label: '左栏标签块', enabled: false, hint: '二期开放' },
]

function activate(type: BlockType, enabled: boolean) {
  if (!enabled) {
    editor.showToast('该区块本期不可用')
    return
  }
  if (session.active.value && session.blockType.value === type) {
    session.cancelPlace()
    return
  }
  session.startPlace(type)
}

function keyPlace(type: BlockType, enabled: boolean) {
  if (!enabled) {
    editor.showToast('该区块本期不可用')
    return
  }
  session.startPlace(type)
}
</script>

<template>
  <aside class="block-lib">
    <h3>组件库</h3>
    <p id="block-lib-desc" class="hint">
      拖入表内槽位（非整页画布）。同槽再放会替换。键盘：Enter 待放置 → ↑↓ 选槽 → Enter 放入 / Esc 取消。
    </p>
    <ul aria-describedby="block-lib-desc">
      <BlockDraggable
        v-for="it in items"
        :key="it.type"
        :type="it.type"
        :label="it.label"
        :enabled="it.enabled"
        :hint="it.hint"
        :active="session.active.value && session.blockType.value === it.type"
        @activate="activate(it.type, it.enabled)"
        @key-place="keyPlace(it.type, it.enabled)"
      />
    </ul>
  </aside>
</template>

<style scoped>
.block-lib {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--pt-border);
  padding: 12px;
  background: #fff;
  position: relative;
}
h3 {
  margin: 0 0 6px;
  font-size: 14px;
}
.hint {
  font-size: 12px;
  color: #6b7280;
  margin: 0 0 10px;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
