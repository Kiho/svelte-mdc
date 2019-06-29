import App from './App.svelte';

const app: any = new App({
  target: document.body,
  props: {
    name: 'Svelte Material Design Components'
  }
});

(window as any).app = app;

export default app