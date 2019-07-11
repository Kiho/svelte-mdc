<script>
  import { afterUpdate, onMount, onDestroy } from 'svelte';
  import { mdcAfterUpdate, mdcOnDestroy } from '../useRipple';

  export let self = null;
  export let ripple = false;
  export let horizontal = '';
  export let verticalActions = '';
  export let largeTitle = 'yes';
  export let classList = [];
  export let slots = $$props.$$slots || {};

  export let isHorizontal;
  $: isHorizontal = horizontal && 'mdc-card__horizontal-block';
  export let classesActions;
  $: classesActions = verticalActions && 'mdc-card__actions--vertical';
  export let classesTitle;
  $: classesTitle = largeTitle && 'mdc-card__title--large';

  let mdcComponent, prevRipple;
  onMount(() => {
    mdcAfterUpdate(self, mdcComponent, ripple, prevRipple, x => prevRipple = x);
    mdcOnDestroy(mdcComponent);
  });
</script>

<div class="mdc-card">
  <div class="{isHorizontal}">
    <section class="mdc-card__primary-action card-section"  bind:this={self} >
      {#if slots['media']}
      <section class="mdc-card__media">
        <slot name="media" />
      </section>
      {/if}
      {#if slots['title']}
      <div class="mdc-card__title {classesTitle}">
        <slot name="title" />
      </div>
      {/if}
      {#if slots['subtitle']}
      <div class="mdc-card__subtitle">
        <slot name="subtitle" />
      </div>
      {/if}
    </section>
  </div>

  {#if slots['supportingText']}
  <section class="card-section mdc-card__supporting-text">
    <slot name="supportingText" />
  </section>
  {/if}

  {#if slots['actions']}
  <section class="mdc-card__actions {classesActions}">
    <slot name="actions" />
  </section>
  {/if}

</div>

<style type='text/scss'>
  .card-section {
    padding: 0.5rem 1rem
  }
</style>
