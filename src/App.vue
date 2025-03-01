<template>
  <n-config-provider :theme="theme" date-locale="dateZhCN" locale="zhCN" class="full">
    <n-message-provider class="full">
      <n-dialog-provider class="full">
        <n-space vertical class="full">
          <n-layout has-sider style="height: 100vh">
            <n-layout-sider
              bordered
              collapse-mode="width"
              :collapsed-width="64"
              :width="240"
              :collapsed="collapsed"
              show-trigger
              @collapse="collapsed = true"
              @expand="collapsed = false"
            >
              <n-menu
                v-model:value="activeKey"
                :collapsed="collapsed"
                :collapsed-width="64"
                :collapsed-icon-size="22"
                :options="menuOptions"
              />
            </n-layout-sider>
            <n-layout style="padding: 16px">
              <router-view></router-view>
            </n-layout>
          </n-layout>
        </n-space>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>

</template>

<script setup>
import {computed, h, ref} from "vue";
import {
  NIcon, NMenu, NSpace, NLayout, NLayoutSider, NConfigProvider,
  darkTheme, NDialogProvider, NMessageProvider, useOsTheme
} from "naive-ui";
import { RouterLink } from "vue-router";
import {useRequest} from "vue-request";
import axios from "axios";
import global from "@/global.js";

const osThemeRef = useOsTheme();
let theme = computed(() => osThemeRef.value === "dark" ? darkTheme : null);

function renderIcon(icon) {
  return () => h(NIcon, null, { default: () => h(icon) });
}

// noinspection JSUnusedGlobalSymbols
let menuOptions = ref(
    [
        {
            label: () => h(
              RouterLink,
              {
                to: {
                  name: "Home"
                }
              },
              { default: () => "总览" }
            ),
            key: "go-back-home"
        }
    ]
);
const getMenu = () => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(axios.get(`${global.APISRV}/web/menu`));
    }, 1000);
  });
}
function resolveMenuItem(menuItem) {
    console.log(menuItem)
    if (menuItem === null) return null;
    if (menuItem instanceof Array)
        return menuItem.map(
            (item) => {
                return resolveMenuItem(item)
            }
        )
    return {
        label: () => h(
            RouterLink,
            {
                to: menuItem['to']
            },
            {default: () => menuItem['text']}
        ),
        key: menuItem['key'],
        children: resolveMenuItem(menuItem['children'])
    }
}
useRequest(
    getMenu,
    {
      initialData: {
          "data": [
              {
                  "to": "/",
                  "text": "总览",
                  "key": "go-back-home",
                  "children": null
              }
        ]
      },
      onSuccess: (response) => {
          console.log(response.data);
          let menu = []
          for (let datumElement of response.data['data']) {
              menu.push(
                  resolveMenuItem(datumElement)
              )
          }
          menuOptions.value = menu;
      }
    }
);

let activeKey =  ref(null), collapsed = ref(false)
</script>