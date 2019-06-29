<script>
  import { processClasses } from '../helpers';
  // [svelte-upgrade warning]
  // this function needs to be manually rewritten
  export let attrs;
  $: {
    let result = Object.assign({}, $$props);
    let cls = 'mdc-list-group__subheader';
    let classes = [cls];
    result['class'] = processClasses(classes, result['class']);
    attrs = result;
  }
</script>

<h3 {...attrs}><slot></slot></h3>
