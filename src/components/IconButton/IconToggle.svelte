<script>
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';

  const dispatch = createEventDispatcher();

  export let self = null;

  import { MDCIconButtonToggle } from "@material/icon-button";
  import { debounce } from '../helpers'
  /*
      :data-toggle-on="dataToggleOn" 
      :data-toggle-off="dataToggleOff" 
  */
  export let disabled = false;
  export let primary = false;
  export let accent = false;
  export let value = false;
  export let iconOn = '';
  export let iconOff = '';
  export let mdcIconToggle = null;

  onMount(() => {
    mdcIconToggle = MDCIconButtonToggle.attachTo(self)
    // this.observe('disabled',  (disabled, mdcIconToggle) => { mdcIconToggle.disabled = disabled })
    // this.observe('value',  (value, mdcIconToggle) => { mdcIconToggle.on = value })
  });

  onDestroy(() => {
    mdcIconToggle.destroy()
  });

  export let classes;
  $: {
    const classList = []

    disabled && classList.push('mdc-icon-toggle--disabled')
    primary && classList.push('mdc-icon-toggle--primary')
    accent && classList.push('mdc-icon-toggle--accent')

    classes = classList.join(' ')
  }

  export let icon;
  $: {
    icon = value ? iconOn : iconOff
  }

  export let dataToggleOn;
  $: {
    dataToggleOn = JSON.stringify({ 'content': iconOn })
  }

  export let dataToggleOff;
  $: {
    dataToggleOff = JSON.stringify({ 'content': iconOff })
  }

  function toggleValue() {
    value = !value;
    dispatch('input', { value });
  }

  export function onClick() {
    debounce(toggleValue())
  }
</script>

<i bind:this={self} 
  on:click="{onClick}" 
  class="mdc-icon-toggle material-icons {classes}" 
  role="button" 
  >
  {icon}
</i>

