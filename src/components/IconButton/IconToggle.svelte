<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { MDCIconButtonToggle } from "@material/icon-button";
  import { debounce } from '../helpers';
  import { mdcAfterUpdate, mdcOnDestroy } from '../useRipple';

  const dispatch = createEventDispatcher();

  export let iconButton = null;

  /*
      :data-toggle-on="dataToggleOn" 
      :data-toggle-off="dataToggleOff" 
  */
  export let ripple = false;
  export let disabled = false;
  export let primary = false;
  export let accent = false;
  export let value = false;
  export let iconOn = '';
  export let iconOff = '';

  let mdcComponent, mdcRipple, prevRipple;

  onMount(() => {
    mdcComponent = MDCIconButtonToggle.attachTo(iconButton);
    mdcAfterUpdate(iconButton, mdcRipple, ripple, prevRipple, x => prevRipple = x);
    mdcOnDestroy(mdcRipple, mdcComponent);
  });

  export let classes;
  $: {
    const classList = []

    disabled && classList.push('mdc-icon-toggle--disabled');
    primary && classList.push('mdc-icon-toggle--primary');
    accent && classList.push('mdc-icon-toggle--accent');

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

<button
    class="mdc-icon-button"
    bind:this="{iconButton}" >    
  <i
    on:click="{onClick}" 
    class="material-icons {classes}"
    >
    {icon}
  </i>
</button>


