<script>
  import {
    afterUpdate,
    createEventDispatcher,
    onDestroy,
    onMount
  } from "svelte";
  import { MDCDrawer } from '@material/drawer';
  import { addClassToSlot, addClassToSlotNodes } from '../helpers.js';

  export let mdc = 'mdc-drawer';
  export let self = null;
  export let primaryToolbarSpacer = false;
  export let primaryContent = '';
  export let slots = $$props.$$slots || {};
  export let dismissible = false;
  export let modal = false;
  export let open = false;

  let mdcComponent;
  const dispatch = createEventDispatcher();

  export let spacerClasses;
  $: {
    spacerClasses = primaryToolbarSpacer && 'mdc-theme--primary-bg mdc-theme--text-primary-on-primary'
  }

  export let contentClasses;
  $: {
    contentClasses = primaryContent && 'mdc-theme--primary-bg mdc-theme--text-primary-on-primary'
  }

  onMount(() => {
    addClassToSlot(self, 'header', 'mdc-drawer__header');
    addClassToSlot(self, 'default', 'mdc-drawer__content');

    if (!mdcComponent && (dismissible || modal)) { 
      mdcComponent = new MDCDrawer(self);
    }
    if (mdcComponent) {
      mdcComponent.listen("MDCDrawer:opened", () => {
        dispatch("opened");
      });
      mdcComponent.listen("MDCDrawer:closed", (e) => {
        open = false;
        dispatch("closed", e);
        console.log("closed", e);
      });
    }    
  });

  afterUpdate(() => {
    if (mdcComponent && open !== mdcComponent.open) {
      mdcComponent.open = open;
    }
  });

  onDestroy(() => {
    if (mdcComponent) mdcComponent.destroy();
  });

  export function toggle(isOpen) {
    open = isOpen === undefined ? !open : isOpen;
  }
</script>

<aside bind:this="{self}"    
    class="mdc-drawer {dismissible ? 'mdc-drawer--dismissible' : ''}{modal ? 'mdc-drawer--modal' : ''}" >
  <slot name="header" />
  <slot />
</aside>
{#if modal}
<div class="mdc-drawer-scrim" />
{/if}

