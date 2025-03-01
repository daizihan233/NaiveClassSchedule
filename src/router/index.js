import {createRouter, createWebHistory} from "vue-router";

const router = createRouter(
    {
        history: createWebHistory(),
        routes: [
            {
                path: '/',
                name: 'Home',
                component: () => import("../views/Home.vue")
            },
            {
                path: '/config/:school/:grade/subjects',
                name: 'Subjects',
                component: () => import("../views/SubjectsConfig.vue")
            },
            {
                path: '/config/:school/:grade/timetable',
                name: 'Timetable',
                component: () => import("../views/TimetableConfig.vue")
            },
            {
                path: '/config/:school/:grade/:cls/schedule',
                name: 'Schedule',
                component: () => import("../views/ScheduleConfig.vue")
            },
            {
                path: '/config/:school/:grade/:cls/settings',
                name: 'Settings',
                component: () => import("../views/SettingsConfig.vue")
            },
            {
                path: '/404',
                name: '404',
                component: () => import("../views/NotFound.vue")
            },
            {
                path: '/:pathMatch(.*)',
                name: 'NotFound',
                redirect: '/404'
            }
        ]
    }
)

export default router