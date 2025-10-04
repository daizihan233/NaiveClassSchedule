<script setup>
import {ref, watch} from 'vue'
import {NButton, NInput, NModal, NSpace} from 'naive-ui'

const props = defineProps({
  show: {type: Boolean, default: false},
  title: {type: String, default: '你是入吗？'},
  confirmText: {type: String, default: '确认'},
  loading: {type: Boolean, default: false}
})
const emit = defineEmits(['update:show', 'confirm'])

const pwd = ref('')
watch(() => props.show, (v) => {
  if (!v) pwd.value = ''
})

function onConfirm() {
  emit('confirm', pwd.value)
}
</script>

<template>
  <n-modal :show="props.show" :title="props.title" preset="dialog" @update:show="val=>emit('update:show', val)">
    <n-space vertical>
      <div>此操作需要密码</div>
      <n-input v-model:value="pwd" clearable placeholder="输入密码" type="password"/>
    </n-space>
    <template #action>
      <n-button :loading="props.loading" type="primary" @click="onConfirm">{{ props.confirmText }}</n-button>
    </template>
  </n-modal>
</template>



