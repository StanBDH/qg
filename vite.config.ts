import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages sert le site sous /qg/.
export default defineConfig({ base: '/qg/', plugins: [react()] })
