<script>
  export let adjustMargin = '';

  export let classes;
  $: classes = adjustMargin && 'mdc-typography--adjust-margin';
</script>

<h2 class="mdc-typography--title {classes}">
    <slot />
</h2>



<style type='text/scss'>
@import "@material/typography/mdc-typography";
</style>
