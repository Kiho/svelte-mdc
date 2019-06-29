<script>
  export let adjustMargin = '';

  export let classes;
  $: classes = adjustMargin && 'mdc-typography--adjust-margin';
</script>

<h1 class="mdc-typography--headline {classes}">
    <slot />
</h1>

