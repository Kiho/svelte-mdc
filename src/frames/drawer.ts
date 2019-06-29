import Drawer from './Drawer.svelte';

const drawer = new Drawer({
  target: document.querySelector('#app-root')!,
  props: {
    name: 'Svelte Material Design Components'
  }
});

(window as any).drawer = drawer;

export default drawer;