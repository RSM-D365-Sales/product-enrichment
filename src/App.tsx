import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ConfigProvider } from './context/ConfigContext'
import { ProductsProvider } from './context/ProductsContext'
import { ChatProvider } from './context/ChatContext'
import Workspace from './pages/Workspace'
import Styles from './pages/Styles'
import StyleDetail from './pages/StyleDetail'
import Setup from './pages/Setup'

export default function App() {
  return (
    <ConfigProvider>
      <ProductsProvider>
        <ChatProvider>
          <HashRouter>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Workspace />} />
                <Route path="styles" element={<Styles />} />
                <Route path="style/:styleNumber" element={<StyleDetail />} />
                <Route path="setup" element={<Setup />} />
              </Route>
            </Routes>
          </HashRouter>
        </ChatProvider>
      </ProductsProvider>
    </ConfigProvider>
  )
}
