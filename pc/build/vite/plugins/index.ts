import type { Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { VitePWA } from 'vite-plugin-pwa';
import html from 'vite-plugin-html';
import { viteMockServe } from 'vite-plugin-mock';
import { configVisualizerConfig } from './visualizer';

export function createVitePlugins(env: Record<string, string>, command: string, mode: string) {
  const isBuild = command === 'build';
  const isServe = command === 'serve';
  const isMock = mode.endsWith('mock');
  const fontIconUUID = env.VITE_FONTICONUUID;
  const commonCss: string[] = [];
  const commonJs = [
    `https://at.alicdn.com/t/${fontIconUUID}.js`,
    // "https://webapi.amap.com/loader.js"
  ];
  let prodMock = true;
  const vitePlugins: (Plugin | Plugin[])[] = [
    // have to
    vue({
      customElement: 'Diff',
    }),
    // have to
    vueJsx(),
    html({
      inject: {
        injectData: {
          title: '爱线索分享',
          css: [...commonCss],
          js: [...commonJs],
        },
      },
      minify: true,
    }),
  ];
  // The following plugins only work in the production environment
  if (isBuild) {
    vitePlugins.push(
      VitePWA({
        registerType: 'autoUpdate',
      })
    );

    // rollup-plugin-visualizer
    vitePlugins.push(configVisualizerConfig());
  }
  if (isMock) {
    vitePlugins.push(
      viteMockServe({
        // default
        mockPath: 'mock',
        localEnabled: !isBuild && env.VITE_USE_MOCK === 'true',
        prodEnabled: isBuild && prodMock,
        //  这样可以控制关闭mock的时候不让mock打包到最终代码内
        injectCode: `
        import { setupProdMockServer } from '../mock/_createProductionServer';
        setupProdMockServer();
        `,
      })
    );
  }
  return vitePlugins;
}
