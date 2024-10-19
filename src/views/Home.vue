<script setup>
import { useRequest } from 'vue-request';
import {
    NCard, NStatistic, NFlex, NTable, NTh, NTd, NTr, NThead, NTbody, useThemeVars, NHighlight
} from 'naive-ui';
import axios from 'axios';
import {computed, reactive, ref} from "vue";
import gsap from 'gsap';

const getStatistic = () => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(axios.get('https://class.khbit.cn/api/statistic'));
    }, 1000);
  });
}
const statInfo = reactive(
    {
        "weather_error":0,
        "websocket_disconnect":{},
        "clients":[],
        "websocket_disconnect_count": 0,
        "clients_count": 0
    }
);

let statTable = ref([]);
// noinspection JSCheckFunctionSignatures
useRequest(
    getStatistic,
    {
      pollingInterval: 1000,
      initialData: {
          "weather_error": 0,
          "websocket_disconnect": {},
          "clients": [],
          "websocket_disconnect_count": 0,
          "clients_count": 0
      },
      onSuccess: (response) => {
        let statMap = {};
        statTable.value = []
        console.log(response.data);
        gsap.to(statInfo, {
          "weather_error": response.data["weather_error"],
          "websocket_disconnect": response.data["websocket_disconnect_count"],
          "clients": response.data["clients_count"]
        });
        // noinspection JSCheckFunctionSignatures
        for (let [key, value] of Object.entries(response.data["websocket_disconnect"])) {
            statMap[key] = ["已断开连接", value];
        }
        for (let [, name] of Object.entries(response.data["clients"])) {
            if (statMap[name])
                statMap[name][0] = "保持连接";
            else
                statMap[name] = ["保持连接", 0];
        }
        for (let [key, value] of Object.entries(statMap)) {
            statTable.value.push([key, value[0], value[1]]);
        }
        console.log(statTable);
      }
    }
);
const weatherError = computed(() => {
    return parseInt(statInfo.weather_error).toLocaleString();
});
const wsDisconnect = computed(() => {
    return parseInt(statInfo.websocket_disconnect).toLocaleString();
});
const clientsCount = computed(() => {
    // noinspection JSCheckFunctionSignatures
    return parseInt(statInfo.clients).toLocaleString();
});
const themeVars = useThemeVars()
</script>

<template>
    <NFlex vertical>
        <NFlex justify="center">
            <NCard class="stat">
              <NStatistic label="天气上游 API 响应错误" :value="weatherError"/>
            </NCard>
            <NCard class="stat">
              <NStatistic label="WebSocket 异常断连" :value="wsDisconnect"/>
            </NCard>
            <NCard class="stat">
             <NStatistic label="正在连接的客户端数量" :value="clientsCount"/>
            </NCard>
        </NFlex>
        <NCard title="各班详情">
            <n-table :bordered="false" :single-line="false">
                <n-thead>
                  <n-tr>
                    <n-th>班级</n-th>
                    <n-th>连接状态</n-th>
                    <n-th>异常断连次数</n-th>
                  </n-tr>
                </n-thead>
                <n-tbody>
                  <n-tr v-for="[className, status, count] in statTable">
                    <n-td>{{ className }}</n-td>
                    <n-td>
                        <n-highlight
                          :text="status"
                          :patterns="['保持连接']"
                          :highlight-style="{
                            padding: '0 6px',
                            borderRadius: themeVars.borderRadius,
                            display: 'inline-block',
                            color: themeVars.baseColor,
                            background: themeVars.primaryColor,
                            transition: `all .3s ${themeVars.cubicBezierEaseInOut}`,
                          }"
                        />
                    </n-td>
                    <n-td>{{ count }}</n-td>
                  </n-tr>
                </n-tbody>
              </n-table>
        </NCard>
    </NFlex>
</template>
