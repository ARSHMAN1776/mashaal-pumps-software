import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { FluentProvider, webLightTheme } from '@fluentui/react-components'
import { AppProvider } from './context/AppContext'
import App from './App'
import './style.css'

createRoot(document.querySelector<HTMLDivElement>('#app')!).render(
  createElement(
    FluentProvider,
    { theme: webLightTheme },
    createElement(AppProvider, null, createElement(App))
  ),
)
