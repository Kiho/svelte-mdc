<script>
  export let fixedColumnWidth = '';
  export let align = '';

  export let classes;
  $: {
    const classList = []

    fixedColumnWidth && classList.push('mdc-layout-grid--fixed-column-width')
    align === 'left' && classList.push('mdc-layout-grid--align-left')
    align === 'right' && classList.push('mdc-layout-grid--align-right')

    classes = classList.join(' ')
  }
</script>

<div class="mdc-layout-grid {classes}">
    <slot />
</div>

