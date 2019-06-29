<script>
  import { onDestroy, onMount } from 'svelte';
  import { MDCList } from '@material/list';
  import { MDCRipple } from '@material/ripple';
  import { processClasses } from '../helpers';
  // [svelte-upgrade warning]
  // this function needs to be manually rewritten
  export let slots = $$props.$$slots || {};
  export let attrs = null;
  export let as = 'nav';
  export let self = null;
  export let ripple = false;

  let mdcComponent, listItemRipples;
  onMount(() => {
    mdcComponent = new MDCList(self);
  });

  onDestroy(() => {
    mdcComponent.destroy();
    listItemRipples && listItemRipples.forEach(el => el.destroy());
  });

  $: {
    if (ripple && mdcComponent && !listItemRipples) {
      listItemRipples = mdcComponent.listElements.map((el) => new MDCRipple(el));
    } else if (!ripple && mdcComponent && listItemRipples) {
      listItemRipples.forEach(el => el.destroy());
      listItemRipples = null;
    }
  }

  $: {
    let result = Object.assign({}, $$props);
    let cls = 'mdc-list';
    let classes = [cls];
    for (let key of ['two-line', 'dense', 'non-interactive', 'avatar-list']) {
      if (result[key]) {
        classes.push(cls + '--' + key);
      }
      delete result[key];
    }
    result['class'] = processClasses(classes, result['class']);
    attrs = result;
  }
</script>

{#if as === 'ul'}
<ul bind:this={self} {...attrs}>
  <slot></slot>
</ul>
{:else}
<nav bind:this={self} {...attrs}>
  <slot></slot>
</nav>
{/if}

