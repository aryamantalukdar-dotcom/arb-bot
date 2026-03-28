import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ArbBotV2 from './ArbBotV2.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ArbBotV2 />
  </StrictMode>,
)
