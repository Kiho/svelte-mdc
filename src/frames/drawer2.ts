import Drawer2 from './Drawer2.svelte';

const drawer2 = new Drawer2({
  target: document.body,
  props: {
    name: 'Svelte Material Design Components'
  }
});

(window as any).drawer2 = drawer2;

export default drawer2;