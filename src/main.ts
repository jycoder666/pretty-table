import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './shell/debug/fault'
import { requestPersist } from './shell/repo/storageHealth'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

// P1：启动即申请持久化存储（免容量压力下驱逐 IndexedDB 数据）；
// 不 await 不阻塞首屏，不支持的环境内部静默返回 null
requestPersist().catch(() => {})
