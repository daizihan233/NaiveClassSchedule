<template>
  <n-config-provider :theme="theme" date-locale="dateZhCN" locale="zhCN" class="full" :hljs="hljs">
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
  NMenu, NSpace, NLayout, NLayoutSider, NConfigProvider,
  darkTheme, NDialogProvider, NMessageProvider, useOsTheme, useMessage
} from "naive-ui";
import { RouterLink } from "vue-router";
import {useRequest} from "vue-request";
import axios from "axios";
import {APISRV} from "@/global.js";
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'

hljs.registerLanguage('json', json)

const osThemeRef = useOsTheme();
const message = useMessage();
let theme = computed(() => osThemeRef.value === "dark" ? darkTheme : null);
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

// 直接请求，无需 setTimeout 包装，避免 Promise 嵌套潜在问题
const getMenu = () => axios.get(`${APISRV}/web/menu`);

function resolveMenuItem(menuItem) {
    if (!menuItem) return null;
    // 递归处理数组
    if (Array.isArray(menuItem)) return menuItem.map(resolveMenuItem).filter(Boolean);
    const childrenSrc = menuItem.children;
    const resolvedChildren = Array.isArray(childrenSrc) && childrenSrc.length > 0 ? resolveMenuItem(childrenSrc) : undefined;
    return {
        label: () => h(
            RouterLink,
            { to: menuItem['to'] },
            { default: () => menuItem['text'] }
        ),
        key: menuItem['key'],
        children: resolvedChildren
    };
}

useRequest(
    getMenu,
    {
      initialData: {
          data: [
              {
                  to: '/',
                  text: '总览',
                  key: 'go-back-home',
                  children: []
              }
          ]
      },
      onSuccess: (response) => {
          try {
            // axios 返回结构 { data: <payload> }
            const payload = response?.data;
            const rawList = payload?.data;
            if (!Array.isArray(rawList)) {
              console.warn('[menu] 响应 data.data 不是数组，保持原菜单');
              message.warning('菜单数据格式异常，已使用默认菜单');
              return;
            }
            const menu = rawList.map(d => resolveMenuItem(d)).filter(Boolean);
            if (menu.length === 0) {
              console.warn('[menu] 解析后为空，保留原菜单');
              message.warning('菜单为空，已使用默认菜单');
              return;
            }
            menuOptions.value = menu;
          } catch (e) {
            console.error('[menu] 解析失败', e);
            message.error('菜单解析失败');
          }
      },
      onError: (e) => {
        console.error('[menu] 获取失败', e);
        message.error('菜单加载失败');
      }
    }
);

let activeKey =  ref(null), collapsed = ref(false)
</script>