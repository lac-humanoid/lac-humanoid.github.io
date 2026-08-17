import { createRouter, createWebHistory } from 'vue-router'

import Home from '@/views/Home.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: Home },
    // Lazy-loaded so the landing page never pulls in the MuJoCo/ORT bundles.
    { path: '/demo', name: 'demo', component: () => import('@/views/Demo.vue') },
  ],
  scrollBehavior (to) {
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  },
})

export default router
