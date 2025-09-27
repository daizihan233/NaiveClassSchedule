<script setup>
import {
  NForm, NFormItem, NInput, NButton, NFlex, NCode, NCard, NStatistic, NModal, NSpace,
  NSwitch, NDatePicker, useMessage, NText
} from 'naive-ui'
import { reactive, ref, computed } from 'vue'
import axios from 'axios'
import { APISRV } from '@/global.js'
import { useRequest } from 'vue-request'
import { useRoute } from 'vue-router'

const route = useRoute()
const school = computed(() => route.params.school)
const grade = computed(() => route.params.grade)
const cls = computed(() => route.params.cls)
const formRef = ref(null)
const pwd = ref('')

// 表单内部结构拆分，便于交互
// countdown_target: hidden 或 YYYY-MM-DD
// 内部用 countdownMode: 'hidden' | 'date'; countdownDate: timestamp
const dynamicForm = reactive({
  countdownMode: 'hidden',
  countdownDate: Date.now(),
  week_display: true,
  banner_text: '',
  // 新增：存在天气预警时，用预警信息替代横幅文本
  weather_alert_override: false,
  // 新增：是否使用简略的天气预警信息
  weather_alert_brief: false,
  css_style: [
    // { key: '--center-font-size', value: '30px' }
  ]
})

function pad(n){return n.toString().padStart(2,'0')}
function ymd(ts){ const d=new Date(ts);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }
function parseYMD(str){ const [y,m,d]=str.split('-').map(Number); return new Date(y,m-1,d).getTime() }

function buildPayload(){
  const css = {}
  for(const item of dynamicForm.css_style){
    if(!item.key) continue
    css[item.key] = item.value ?? ''
  }
  const countdown_target = dynamicForm.countdownMode==='hidden' ? 'hidden' : ymd(dynamicForm.countdownDate)
  return {
    countdown_target,
    week_display: dynamicForm.week_display,
    banner_text: dynamicForm.banner_text,
    // 新增字段随 payload 一并提交
    weather_alert_override: dynamicForm.weather_alert_override,
    weather_alert_brief: dynamicForm.weather_alert_brief,
    css_style: css
  }
}

// css_style 动态增删
function addCssItem(){ dynamicForm.css_style.push({ key: '', value: '' }) }
function removeCssItem(index){ dynamicForm.css_style.splice(index,1) }

// 提交弹窗
const showModal = ref(false)
const disabledButton = ref(false)
const buttonText = ref('确认提交')
function submit(){ showModal.value = true }

const messages = useMessage()

const putSettings = () => {
  const payload = buildPayload()
  return Promise.resolve(
    axios.put(
      `${APISRV}/web/config/${school.value}/${grade.value}/${cls.value}/settings`,
      payload,
      { auth:{ username:'ElectronClassSchedule', password: pwd.value } }
    )
  )
}

function okay(){
  disabledButton.value = true
  buttonText.value = '你等会儿'
  useRequest(putSettings,{
    onSuccess:()=>{ messages.success('服务端说行'); showModal.value=false },
    onError:(error)=>{
      if(error.status===401) messages.error('你寻思寻思这密码它对吗？')
      else if(error.status===400) messages.error('码姿不对，删了重写！（服务端校验不通过）')
      else messages.error(`服务端看完天塌了（状态码：${error.status}）`)
    }
  })
  buttonText.value='确认提交'
  disabledButton.value=false
}

const getSettings = () => {
  return Promise.resolve(
    axios.get(`${APISRV}/web/config/${school.value}/${grade.value}/${cls.value}/settings`)
  )
}

useRequest(getSettings,{
  refreshDeps:[school,grade,cls],
  initialData:{
    countdown_target:'hidden',
    week_display:true,
    banner_text:'',
    // 新增字段默认值，便于后端缺省兼容
    weather_alert_override:false,
    weather_alert_brief:false,
    css_style:{}
  },
  onSuccess:(resp)=>{
    const data = resp.data
    // countdown
    if(data.countdown_target==='hidden'){
      dynamicForm.countdownMode='hidden'
    } else {
      dynamicForm.countdownMode='date'
      const ts = parseYMD(data.countdown_target)
      if(!Number.isNaN(ts)) dynamicForm.countdownDate = ts
    }
    dynamicForm.week_display = data.week_display
    dynamicForm.banner_text = data.banner_text
    // 新增字段回填（后端未返回时默认 false）
    dynamicForm.weather_alert_override = !!data.weather_alert_override
    dynamicForm.weather_alert_brief = !!data.weather_alert_brief
    dynamicForm.css_style = []
    for(const k of Object.keys(data.css_style||{})){
      dynamicForm.css_style.push({ key:k, value:data.css_style[k] })
    }
    if(dynamicForm.css_style.length===0){
      // 初始化示例
      dynamicForm.css_style.push({ key:'--center-font-size', value:'30px' })
    }
  }
})

const preview = computed(()=> JSON.stringify(buildPayload(), null, 2))
</script>

<template>
  <NFlex vertical>
    <NCard title="所选信息">
      <NFlex justify="center">
        <NCard class="stat"><NStatistic label="所选学校" :value="school.toString()" /></NCard>
        <NCard class="stat"><NStatistic label="所选年级" :value="grade.toString()" /></NCard>
        <NCard class="stat"><NStatistic label="所选班级" :value="cls.toString()" /></NCard>
      </NFlex>
    </NCard>
    <NCard title="配置表单">
      <n-form ref="formRef" :model="dynamicForm" class="center">
        <NSpace vertical>
          <NCard size="small" title="倒计时目标">
            <NSpace vertical>
              <n-form-item label="模式">
                <n-flex>
                  <n-button :type="dynamicForm.countdownMode==='hidden'?'primary':'default'" @click="dynamicForm.countdownMode='hidden'">隐藏</n-button>
                  <n-button :type="dynamicForm.countdownMode==='date'?'primary':'default'" @click="dynamicForm.countdownMode='date'" style="margin-left:8px;">日期</n-button>
                </n-flex>
              </n-form-item>
              <n-form-item label="日期" v-if="dynamicForm.countdownMode==='date'">
                <NDatePicker v-model:value="dynamicForm.countdownDate" type="date" />
              </n-form-item>
            </NSpace>
          </NCard>
          <NCard size="small" title="周显示">
            <n-form-item label="是否显示周数">
              <NSwitch v-model:value="dynamicForm.week_display" />
            </n-form-item>
          </NCard>
          <NCard size="small" title="横幅文本">
            <n-form-item label="banner_text">
              <NInput v-model:value="dynamicForm.banner_text" placeholder="空则不显示" clearable />
            </n-form-item>
          </NCard>
          <!-- 新增：天气预警覆盖横幅设置 -->
          <NCard size="small" title="天气预警">
            <n-form-item label="存在预警时替代横幅文本">
              <NSwitch v-model:value="dynamicForm.weather_alert_override" />
            </n-form-item>
            <n-form-item label="是否使用简略的预警信息">
              <NSwitch v-model:value="dynamicForm.weather_alert_brief" />
            </n-form-item>
            <NText depth="3" style="font-size: 12px;">
              开启后：当系统检测到天气预警，将用预警信息替换上面的横幅文本内容。
            </NText>
            <br />
            <NText depth="3" style="font-size: 12px;">
              简略信息示例：用“江苏省气象台发布大雾黄色预警”等短语替代冗长描述。
            </NText>
          </NCard>
          <NCard size="small" title="CSS 变量样式 (key / value)">
            <NSpace vertical>
              <NCard size="small" v-for="(item, index) in dynamicForm.css_style" :key="index" :title="item.key || ('条目 '+(index+1))">
                <NSpace vertical>
                  <n-form-item :label="'变量名'" :path="`css_style[${index}].key`">
                    <NInput v-model:value="item.key" placeholder="--center-font-size" />
                  </n-form-item>
                  <n-form-item :label="'变量值'" :path="`css_style[${index}].value`">
                    <NInput v-model:value="item.value" placeholder="30px" />
                  </n-form-item>
                  <NButton tertiary type="error" @click="removeCssItem(index)" v-if="dynamicForm.css_style.length>1">删除此项</NButton>
                </NSpace>
              </NCard>
              <NButton dashed type="primary" @click="addCssItem">+ 增加变量</NButton>
            </NSpace>
          </NCard>
          <n-form-item>
            <n-flex justify="center">
              <n-button attr-type="button" @click="submit">提交</n-button>
            </n-flex>
          </n-form-item>
        </NSpace>
      </n-form>
    </NCard>
    <NCard title="提交前预览">
      <n-code :code="preview" language="json" show-line-numbers />
    </NCard>
    <n-modal v-model:show="showModal" preset="dialog" title="Dialog">
      <template #header><div>你是入吗？</div></template>
      <n-space vertical>
        <div>此操作需要密码</div>
        <n-input type="password" v-model:value="pwd" clearable />
      </n-space>
      <template #action>
        <n-button attr-type="button" @click="okay" :disabled="disabledButton">{{ buttonText }}</n-button>
      </template>
    </n-modal>
  </NFlex>
</template>