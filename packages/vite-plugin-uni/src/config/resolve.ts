import { UserConfig } from 'vite'
import { VitePluginUniResolvedOptions } from '..'

export function createResolve(
  options: VitePluginUniResolvedOptions
): UserConfig['resolve'] {
  return {
    alias: {
      '@': options.inputDir,
      '~@': options.inputDir, // src: url('~@/static/uni.ttf') format('truetype');
      vue: require.resolve('@dcloudio/uni-h5-vue', {
        paths: [process.env.UNI_CLI_CONTEXT || process.cwd()],
      }),
    },
  }
}