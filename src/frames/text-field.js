import TextField from './TextField.svelte';

const textField = new TextField({
  target: document.body,
  props: {
    name: 'Svelte Material Design Components'
  }
});

window.textField = textField;

export default textField;