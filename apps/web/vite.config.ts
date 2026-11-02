import {defineConfig} from 'vite';
import {resolve} from 'node:path';
export default defineConfig({root:resolve(__dirname),server:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api':'http://localhost:3000'}},build:{outDir:'dist'}});
