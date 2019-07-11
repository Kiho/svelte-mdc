<script>
  import {
    afterUpdate,
    createEventDispatcher,
    onDestroy,
    onMount
  } from 'svelte';
  import { processClasses, addClassToSlot, addClassToSlotNodes } from '../helpers.js';
  import { MDCTopAppBar } from '@material/top-app-bar';

  const dispatch = createEventDispatcher();
  export let self = null;
  export let attrs = [];
  export let title;
  
  let slots = $$props.$$slots || {};
  let navigation;
  const navClass = 'mdc-top-app-bar__navigation-icon';
  const actionClass = 'mdc-top-app-bar__action-item';
  
  let mdcComponent;
  onMount(() => {
    addClassToSlot(self, 'navigation', navClass);
    addClassToSlotNodes(self, 'actions', actionClass);

    mdcComponent = new MDCTopAppBar(self);
    mdcComponent.listen('MDCTopAppBar:nav', (e) => {
      status = undefined;
      dispatch('nav', e);
    });
  });

  onDestroy(() => {
    mdcComponent.destroy();
  });

  $: {
    let result = Object.assign({}, $$props);
    let cls = 'mdc-top-app-bar';
    let classes = [cls];
    for (let key of [
      'short',
      'short-collapsed',
      'fixed',
      'prominent',
      'dense'
    ]) {
      if (result[key]) {
        classes.push(cls + '--' + key);
      }
      delete result[key];
    }
    result['class'] = processClasses(classes, result['class']);
    attrs = result;
  }
</script>

<header bind:this="{self}" {...attrs}>
  <div class="mdc-top-app-bar__row">
    {#if slots['navigation'] || title}
    <section class="mdc-top-app-bar__section mdc-top-app-bar__section--align-start">
      <slot name="navigation"/>
      {#if title}
      <span class="mdc-top-app-bar__title" >
        {title}
      </span>
      {/if}
    </section>
    {/if}
    <slot />
    {#if slots['actions']}
    <section class="mdc-top-app-bar__section mdc-top-app-bar__section--align-end"  role="toolbar">
      <slot name="actions" />
    </section>
    {/if}
  </div>
</header>