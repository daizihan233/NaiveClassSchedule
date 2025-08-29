<script setup>
import {
    NForm, NFormItem, NInput, NButton, NFlex, NCode, NCard, NStatistic, NModal, NSpace, useMessage
} from "naive-ui";
import {reactive, ref, computed} from "vue";
import {zip} from "@/utils.js";
import axios from "axios";
import {APISRV} from "@/global.js";
import {useRequest} from "vue-request";
import {useRoute} from "vue-router";

const route = useRoute();

const school = computed(() => route.params.school);
const grade = computed(() => route.params.grade);
const formRef = ref(null);
let pwd = ref('');

const dynamicForm = reactive({
  abbr: [{ text: "" }],
  fullName: [{ text: "" }]
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

const putSubjects = () => {
    return Promise.resolve(
        axios.put(
            `${APISRV}/web/config/${school.value}/${grade.value}/subjects`,
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
        putSubjects,
        {
            onSuccess: (response) => {
                console.log(response.data)
                console.log(response.status)
                messages.success("服务端说行")
                showModal.value = false
            },
            onError: (error) => {
                console.log(error)
                if (error.status === 401) {
                    messages.error("你寻思寻思这密码它对吗？")
                } else if (error.status === 400) {
                    messages.error("码姿不对，删了重写！（服务端校验不通过）")
                } else {
                    messages.error(`服务端看完天塌了（状态码：${error}）`)
                }
            }
        }
    );
    buttonText.value = "确认提交"
    disabledButton.value = false
}

const getSubjects = () => {
  return Promise.resolve(axios.get(`${APISRV}/web/config/${school.value}/${grade.value}/subjects`));
}

useRequest(
    getSubjects,
    {
      refreshDeps: [school, grade],
      initialData: {
          "abbr": [],
          "fullName": []
      },
      onSuccess: (response) => {
          console.log(response.data);
          dynamicForm.abbr = response.data['abbr'];
          dynamicForm.fullName = response.data['fullName'];
      }
    }
);
</script>

<template>
    <NFlex vertical>
        <NCard title="所选信息">
            <NFlex justify="center">
                <NCard class="stat">
                  <NStatistic label="所选学校" v-bind:value="school.toString()"/>
                </NCard>
                <NCard class="stat">
                  <NStatistic label="所选年级" v-bind:value="grade.toString()"/>
                </NCard>
            </NFlex>
        </NCard>
        <NCard title="配置表单">
            <n-form ref="formRef" :model="dynamicForm" class="center" :show-label="false">
                <n-form-item class="center" v-for="(item, index) in zip(dynamicForm.abbr, dynamicForm.fullName)">
                    <n-flex justify="center" size="large" class="center">
                        <n-form-item
                          :key="index"
                          :label="`课程 ${index + 1} 缩写`"
                          :path="`abbr[${index}].text`"
                          :rule="{
                            required: true,
                            message: `课程 ${index + 1} 缩写`,
                            trigger: ['input', 'blur'],
                          }"
                        >
                          <n-input v-model:value="item[0].text" clearable />
                        </n-form-item>
                        <n-form-item
                          :key="index"
                          :label="`课程 ${index + 1} 全写`"
                          :path="`fullName[${index}].text`"
                          :rule="{
                            required: true,
                            message: `课程 ${index + 1} 全写`,
                            trigger: ['input', 'blur'],
                          }"
                        >
                          <n-input v-model:value="item[1].text" clearable />
                          <n-button style="margin-left: 12px" @click="removeItem(index)">
                            删除
                          </n-button>
                        </n-form-item>
                    </n-flex>
                </n-form-item>
                <n-form-item class="center">
                  <n-flex justify="center" size="large" class="center">
                    <n-button attr-type="button" @click="submit">
                      提交
                    </n-button>
                    <n-button attr-type="button" @click="addItem">
                      增加
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