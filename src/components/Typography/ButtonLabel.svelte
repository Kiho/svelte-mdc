<script>
  export let adjustMargin = '';

  export let classes;
  $: classes = adjustMargin && 'mdc-typography--adjust-margin';
</script>

<span class="mdc-typography--button {classes}">
    <slot />
</span>



<style type='text/scss'>
@import "@material/typography/mdc-typography";
</style>
