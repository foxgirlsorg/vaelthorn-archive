import { mount } from 'svelte'
import '@fontsource-variable/source-sans-3'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app
