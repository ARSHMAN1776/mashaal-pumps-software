import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { FluentProvider, webLightTheme } from '@fluentui/react-components'
import { AppProvider } from './context/AppContext'
import { ToastProvider } from './components/common/Toast'
import { ConfirmProvider } from './components/common/Confirm'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import App from './App'
import './style.css'
import './ui.css'
import './design.css'

createRoot(document.querySelector<HTMLDivElement>('#app')!).render(
  createElement(
    FluentProvider,
    { theme: webLightTheme },
    createElement(
      ErrorBoundary,
      null,
      createElement(
        ToastProvider,
        null,
        createElement(ConfirmProvider, null, createElement(AppProvider, null, createElement(App))),
      ),
    ),
  ),
)
