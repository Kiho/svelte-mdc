import TestPage from './TestPage.svelte';

const testpage = new TestPage({
  target: document.body,
  props: {
    name: 'Svelte Material Design Components'
  }
});

(window as any).testpage = testpage;

export default testpage;