<script setup>
import {useRequest} from 'vue-request';
import {NCard, NDataTable, NFlex, NStatistic, NTag, useThemeVars} from 'naive-ui';
import axios from 'axios';
import {computed, h, reactive, ref} from "vue";
import gsap from 'gsap';

const columns = [
  {
      title: '班级',
      key: 'name',
      defaultSortOrder: false,
      sorter: 'default'
  },
  {
      title: '连接状态',
      key: 'status',
      defaultSortOrder: false,
      sorter: 'default',
      render(row) {
          return h(
                NTag,
                {
                    style: {
                        marginRight: '6px'
                    },
                    type: row.status === '已断开连接' ? "error" : 'success',
                    bordered: false
                },
                {
                    default: () => row.status
                }
            )

      }
  },
  {
      title: '今日异常断连次数',
      key: 'disconnect',
      defaultSortOrder: false,
      sorter: (row1, row2) => row1.disconnect - row2.disconnect
  }
]
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
        for (let [keys, value] of Object.entries(statMap)) {
            statTable.value.push(
                {
                    key: keys,
                    name: keys,
                    status: value[0],
                    disconnect: value[1]
                }
            )
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
useThemeVars();
</script>

<template>
    <NFlex vertical>
        <NCard title="今日统计">
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
        </NCard>
        <NCard title="各班详情">
            <n-data-table
              ref="dataTableInst"
              :columns="columns"
              :data="statTable"
            />
        </NCard>
    </NFlex>
</template>
