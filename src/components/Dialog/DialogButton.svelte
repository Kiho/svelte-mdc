<script>
  export let label = "";
  export let action = null;
</script>

<button
  type="button"
  class="mdc-button mdc-dialog__button"
  data-mdc-dialog-action="{action}"
>
  {#if label}
  <span class="mdc-button__label">{label}</span>
  {/if}
  <slot></slot>
</button>
