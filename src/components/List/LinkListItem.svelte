<script>
  import { processClasses } from '../helpers';
  export let showGraphic = false;
  export let primaryText='';
  export let secondText='';
  export let showMeta = false;

  // [svelte-upgrade warning]
  // this function needs to be manually rewritten
  export let attrs;
  $: {
    let result = Object.assign({}, $$props);
    let cls = 'mdc-list-item';
    let classes = [cls];
    for (let key of ['selected', 'activated']) {
      if (result[key]) {
        classes.push(cls + '--' + key);
      }
      delete result[key];
    }
    for (let key of ['primaryText', 'secondText', 'showGraphic', 'showMeta']) {
      delete result[key];
    }
    result['class'] = processClasses(classes, result['class']);
    attrs = result;
  }
</script>

<a href="#!" {...attrs}>
  {#if showGraphic}
  <span role="presentation" class="mdc-list-item__graphic">
    <slot name="graphic"></slot>
  </span>
  {/if} {#if primaryText}
  <span class="mdc-list-item__text">
    {primaryText} {#if secondText}
    <span class="mdc-list-item__secondary-text">
      {secondText}
    </span>
    {/if}
  </span>
  {:else}
  <slot></slot>
  {/if} {#if showMeta}
  <span role="presentation" class="mdc-list-item__meta">
    <slot name="meta"></slot>
  </span>
  {/if}
</a>
