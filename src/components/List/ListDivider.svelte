<script>
  import { processClasses } from '../helpers.js';
  export let inList = false;

  // [svelte-upgrade warning]
  // this function needs to be manually rewritten
  export let attrs;
  $: {
    let result = Object.assign({}, $$props);
    let classes = ['mdc-list-divider'];
    if (result['inList']) {
      result.role = 'separator';
    }
    delete result.inList;
    result['class'] = processClasses(classes, result['class']);
    attrs = result;
  }
</script>

{#if inList}
<li {...attrs}></li>
{:else}
<hr {...attrs} />
{/if}
