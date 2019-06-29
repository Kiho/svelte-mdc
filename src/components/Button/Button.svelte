<script>
  import { onDestroy, onMount } from 'svelte';
  import { MDCRipple } from '@material/ripple';
  import { buildClasses } from '../helpers';

  export let self = null;

  export let raised = false;
  export let unelevated = false;
  export let stroked = false;
  export let dense = false;
  export let compact = false;
  export let background = '';
  export let color = '';
  export let href = '';
  export let name = '';
  export let disabled = false;
  export let icon = '';
  export let type = '';

  export let mdcRipple = null;
  export let classes;

  $: classes = buildClasses({
      'mdc-button--raised': raised,
      'mdc-button--unelevated': unelevated,
      'mdc-button--stroked': stroked,
      'mdc-button--dense': dense,
      'mdc-button--compact': compact,
      ['mdc-theme--' + background + '-bg']: !!background,
      ['mdc-theme--' + color + '-bg']: !!color,
    });

  onMount(() => {
    mdcRipple = MDCRipple.attachTo(self);
  });

  onDestroy(() => {
    if (mdcComponent) mdcComponent.destroy();
  });
</script>

{#if href}
  <a role="button" bind:this={self} {href} {name} {disabled} class="mdc-button {classes}">
  {#if icon}
    <i class="material-icons mdc-button__icon">{icon}</i>
  {/if}
    <slot />
  </a>
{:else}
  <button bind:this={self} {type} {name} {disabled} class="mdc-button {classes}" on:click>
  {#if icon}
    <i class="material-icons mdc-button__icon">{icon}</i>
  {/if}
    <slot />
  </button>
{/if}

