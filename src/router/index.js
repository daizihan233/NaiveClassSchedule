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
                path: '/config/:school/:class/subjects',
                name: 'Subjects',
                component: () => import("../views/SubjectsConfig.vue")
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