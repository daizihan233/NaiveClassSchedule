<script setup>
import {
    NForm, NFormItem, NInput, NButton, NFlex, NCode, NCard, NStatistic, NModal, NSpace,
    NSelect, useMessage
} from "naive-ui";
import {reactive, ref, computed} from "vue";
import axios from "axios";
import {APISRV} from "@/global.js";
import {useRequest} from "vue-request";
import {useRoute} from "vue-router";

const route = useRoute();
const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
let optionsLst = ref([])
const school = computed(() => route.params.school);
const grade = computed(() => route.params.grade);
const cls = computed(() => route.params.cls);
const formRef = ref(null);
let pwd = ref('');
let needs = {}

const dynamicForm = reactive({
  "daily_class":[
    {
      "Chinese":"日",
      "English":"SUN",
      "classList":[],
      "timetable":"常日"
    },
    {
      "Chinese":"一",
      "English":"MON",
      "classList":[],
      "timetable":"常日"
    },
    {
      "Chinese":"二",
      "English":"TUE",
      "classList":[],
      "timetable":"常日"
    },
    {
      "Chinese":"三",
      "English":"WED",
      "classList":[],
      "timetable":"常日"
    },
    {
      "Chinese":"四",
      "English":"THR",
      "classList":[],
      "timetable":"常日"
    },
    {
      "Chinese":"五",
      "English":"FRI",
      "classList":[],
      "timetable":"常日"
    },
    {
      "Chinese":"六",
      "English":"SAT",
      "classList":[],
      "timetable":"常日"
    }
  ]
});

const removeItem = (index) => {
  dynamicForm.abbr.splice(index, 1);
  dynamicForm.fullName.splice(index, 1);
};

const addItem = () => {
  dynamicForm.abbr.push({ text: "" });
  dynamicForm.fullName.push({ text: "" });
};

let showModal = ref(false);
let disabledButton = ref(false);
let buttonText = ref("确认提交");

function submit() {
    showModal.value = true;
}

const putSchedule = () => {
    return Promise.resolve(
        axios.put(
            `${APISRV}/web/config/${school.value}/${grade.value}/${cls.value}/schedule`,
            formRef.value,
            {
                auth: {
                    username: 'ElectronClassSchedule',
                    password: pwd.value
                }
            }
        )
    );
}
const messages = useMessage();
function okay() {
    disabledButton.value = true
    buttonText.value = "你等会儿"
    useRequest(
        putSchedule,
        {
            onSuccess: (response) => {
                console.log(response.data)
                console.log(response.status)
                messages.success("服务端说行")
                showModal.value = false
            },
            onError: (error) => {
                console.log(error.status)
                if (error.status === 401) {
                    messages.error("你寻思寻思这密码它对吗？")
                } else if (error.status === 400) {
                    messages.error("码姿不对，删了重写！（服务端校验不通过）")
                } else {
                    messages.error(`服务端看完天塌了（状态码：${error.status}）`)
                }
            }
        }
    );
    buttonText.value = "确认提交"
    disabledButton.value = false
}

const getSchedule = () => {
  return Promise.resolve(axios.get(`${APISRV}/web/config/${school.value}/${grade.value}/${cls.value}/schedule`));
}

const getOptions = () => {
  return Promise.resolve(axios.get(`${APISRV}/web/config/${school.value}/${grade.value}/timetable/options`));
}

useRequest(
    getSchedule,
    {
      refreshDeps: [school, grade, cls],
      initialData: {
          "daily_class":[
            {
              "Chinese":"日",
              "English":"SUN",
              "classList":[],
              "timetable":"常日"
            },
            {
              "Chinese":"一",
              "English":"MON",
              "classList":[],
              "timetable":"常日"
            },
            {
              "Chinese":"二",
              "English":"TUE",
              "classList":[],
              "timetable":"常日"
            },
            {
              "Chinese":"三",
              "English":"WED",
              "classList":[],
              "timetable":"常日"
            },
            {
              "Chinese":"四",
              "English":"THR",
              "classList":[],
              "timetable":"常日"
            },
            {
              "Chinese":"五",
              "English":"FRI",
              "classList":[],
              "timetable":"常日"
            },
            {
              "Chinese":"六",
              "English":"SAT",
              "classList":[],
              "timetable":"常日"
            }
          ]
        },
      onSuccess: (response) => {
          console.log(response.data);
          dynamicForm.daily_class = response.data['daily_class'];
      }
    }
);

useRequest(
    getOptions,
    {
      refreshDeps: [school, grade, cls],
      initialData: {
          'options': []
      },
      onSuccess: (response) => {
          console.log(response.data);
          optionsLst.value = []
          for (let datumElement of response.data['options']) {
              optionsLst.value.push(
                  {
                      label: datumElement['label'],
                      value: datumElement['value']
                  }
              )
              needs[datumElement['label']] = datumElement['need']
          }
      }
    }
);
</script>

<template>
    <NFlex vertical>
        <NCard title="所选信息">
            <NFlex justify="center">
                <NCard class="stat">
                  <NStatistic label="所选学校" v-bind:value="school"/>
                </NCard>
                <NCard class="stat">
                  <NStatistic label="所选年级" v-bind:value="grade"/>
                </NCard>
                <NCard class="stat">
                  <NStatistic label="所选班级" v-bind:value="cls"/>
                </NCard>
            </NFlex>
        </NCard>
        <NCard title="配置表单">
            <n-form ref="formRef" :model="dynamicForm" class="center">
                <n-space vertical>
                    <NCard v-for="(item, index) in week" :title="item">
                        <n-form-item
                            :key="index"
                            :label="`${item} 所用作息表`"
                            :path="`daily_class[${index}]['timetable']`"
                            :rule="{
                              required: true,
                            }"
                        >
                            <n-select
                              placeholder="选一个吧"
                              :options="optionsLst"
                              v-model:value="dynamicForm.daily_class[index]['timetable']"
                            />
                        </n-form-item>
                    </NCard>
                </n-space>
                <n-form-item class="center">
                  <n-flex justify="center" size="large" class="center">
                    <n-button attr-type="button" @click="submit">
                      提交
                    </n-button>
                  </n-flex>
                </n-form-item>
            </n-form>
        </NCard>
        <NCard title="提交前预览">
            <n-code :code="JSON.stringify(formRef, null, 2)" language="json" show-line-numbers />
        </NCard>
        <n-modal v-model:show="showModal" preset="dialog" title="Dialog">
            <template #header>
              <div>你是入吗？</div>
            </template>
            <n-space vertical>
                <div>此操作需要密码</div>
                <n-input type="password" v-model:value="pwd" clearable />
            </n-space>
            <template #action>
                <n-button attr-type="button" @click="okay" :disabled="disabledButton">
                    {{ buttonText }}
                </n-button>
            </template>
        </n-modal>
    </NFlex>
</template>