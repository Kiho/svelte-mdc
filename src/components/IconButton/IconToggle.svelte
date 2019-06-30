<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { MDCIconButtonToggle } from "@material/icon-button";
  import { debounce } from '../helpers';
  import { mdcAfterUpdate, mdcOnDestroy } from '../useRipple';

  const dispatch = createEventDispatcher();

  export let iconButton = null;

  export let ripple = false;
  export let disabled = false;
  export let primary = false;
  export let accent = false;
  export let value = false;
  export let iconOn = '';
  export let iconOff = '';
  export let isToggleButton = false;

  let mdcComponent, mdcRipple, prevRipple;
  let mdc = { mdcComponent, mdcRipple, ripple, prevRipple };
  $: mdc.ripple = ripple;

  onMount(() => {
    mdcComponent = MDCIconButtonToggle.attachTo(iconButton);
    mdcAfterUpdate(iconButton, mdc, true);
    mdcOnDestroy(mdc);
  });

  export let classes;
  $: {
    const classList = []

    disabled && classList.push('mdc-icon-toggle--disabled');
    primary && classList.push('mdc-icon-toggle--primary');
    accent && classList.push('mdc-icon-toggle--accent');

    classes = classList.join(' ');
  }

  $: {
    isToggleButton = iconOn && iconOff;
  }

  export let icon;  
  $: {
    if (isToggleButton) {
      icon = value ? iconOn : iconOff;
    }    
    if (mdcComponent) mdcComponent.on = value;
  }

  function toggleValue() {
    if (isToggleButton) {
      value = !value;
      dispatch('input', { value });
    } else {
      dispatch('icon-clicked');
    }    
  }

  export function onClick() {
    debounce(toggleValue)();
  }
</script>

<button
    class="mdc-icon-button"
    bind:this="{iconButton}"
    {disabled} >    
  <i
    on:click="{onClick}" 
    class="material-icons {classes}"
    >
    {icon}
  </i>
</button>


