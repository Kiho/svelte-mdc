<script>
  import { beforeUpdate, onDestroy, onMount } from "svelte";
  import { MDCTextField } from "@material/textfield";
  import { processClasses } from "../helpers";
  import { Icon } from "../Icon";

  const mdcAttrs = [
    "value",
    "min",
    "max",
    "step",
    "maxLength",
    "pattern",
    "required"
  ];

  export let placeholder = '';
  export let id;
  export let icon = null;
  export let iconMode;
  export let name = '';
  export let disabled = false;
  export let value;
  export let label = '';
  export let outlined = false;
  export let type = 'text';
  export let maxLength; 
  // TextArea
  export let textarea = false;
  export let rows = 0;
  export let cols = 0;
  export let helperText = '';
  
  export let textField;
  export let slots = $$props.$$slots || {};

  const fieldAttrs = [
      "id",
      "name",
      "type",
      "helperText",
      "inputAttrs",
      "icon",
      "iconMode",
  ];
  
  let mdcComponent;
  onMount(() => {
    mdcComponent = MDCTextField.attachTo(textField);
    // mdcComponent = new MDCTextField(textField);
  });

  // [svelte-upgrade warning]
  // beforeUpdate and afterUpdate handlers behave
  // differently to their v2 counterparts
  beforeUpdate(() => {
    // for (let key of mdcAttrs) {
    //   if (changed[key]) {
    //     mdcComponent[key] = current[key];
    //   }
    // }
    // for (let key of ["iconMode", "helperText", "outlined", "label"]) {
    //   if (changed[key]) {
    //     mdcComponent.destroy();
    //     mdcComponent = new MDCTextField(textField);
    //     break;
    //   }
    // }
    // update();
  });

  onDestroy(() => {
    mdcComponent.destroy();
  });

  // function update() {
  //   console.log('update()');
  //   for (let i = 0; i < arguments.length; i++) {
  //     const key = mdcAttrs[i];
  //     if (arguments[i] != mdcComponent[key]) {
  //       console.log('result[i] != mdcComponent[i]', i, mdcAttrs[i], mdcComponent[i]);
  //       mdcComponent[key] = result[i];
  //     }
  //   }
  //   // if (mdcComponent) {
  //   //   let result = Object.assign({}, $$props);
  //   //   for (let key of mdcAttrs) {
  //   //     if (result[key] != mdcComponent[key]) {
  //   //       console.log('result[key] != mdcComponent[key]', key, result[key], mdcComponent[key]);
  //   //       mdcComponent[key] = result[key];
  //   //     }
  //   //   }
  //   // }
  // }

  function invalidate() {
    console.log('invalidate()');
    mdcComponent.destroy();
    mdcComponent = MDCTextField.attachTo(textField);
  }

  // $: update(value, min, max, step, maxLength, pattern, required)
  $: helperText, outlined, label, iconMode, mdcComponent && invalidate();

  export let inputAttrs;
  $: {
    var result = {};
    if (helperText) {
      let elem = id + "-helper-text";
      result["aria-controls"] = elem;
      result["aria-describedby"] = elem;
    }
    inputAttrs = result;
  }

  export let attrs;
  $: {
     console.log('slots', slots);     
    let result = Object.assign({}, $$props);
    let cls = "mdc-text-field";
    let classes = [cls, "text-field"];
    for (let key of [
      "box",
      "dense",
      "fullwidth",
      "outlined",
      "disabled",
      "focused"
    ]) {
      if (result[key]) {
        classes.push(cls + "--" + key);
      }
      delete result[key];
    }
    if (result.icon && result.iconMode) {
      classes.push(cls + "--with-" + result.iconMode + "-icon");
    }    
    for (let key of [
      "id",
      "name",
      "type",
      "helperText",
      "inputAttrs",
      "icon",
      "iconMode",
      ...mdcAttrs
    ]) {
      delete result[key];      
    }
    result["class"] = processClasses(classes, result["class"]);
    result["maxlength"] = maxLength;
    attrs = result;
  }
</script>

<div bind:this="{textField}" {...attrs}>
  {#if icon && iconMode === "leading"}
  <Icon class="mdc-text-field__icon" tabindex="0" role="button">{icon}</Icon>
  {/if}
  {#if type === 'textarea'}
  <textarea
    id="{id}"
    name="{name}"
    class="mdc-text-field__input"
    disabled="{disabled}"
    rows="{rows}"
    cols="{cols}"
    {...inputAttrs}
  >{value}</textarea>
  {:else}
  <input
    type="{type}"
    id="{id}"
    name="{name}"
    class="mdc-text-field__input"
    disabled="{disabled}"
    {...inputAttrs}
  />
  {/if}
  {#if icon && iconMode === "trailing"}
  <Icon class="mdc-text-field__icon" tabindex="0" role="button">{icon}</Icon>
  {/if} {#if outlined}
    <div class="mdc-notched-outline">
      <div class="mdc-notched-outline__leading"></div>
      <div class="mdc-notched-outline__notch" style="">
        <label class="mdc-floating-label" style="">{label}</label>
      </div>
      <div class="mdc-notched-outline__trailing"></div>
    </div>
  {:else}
    {#if label}
    <label class="mdc-floating-label" for="{id}">{label}</label>
    {/if} 
    <div class="mdc-line-ripple"></div>
  {/if}
</div>
{#if slots['helperText'] || slots['characterCounter']}
  <div class="mdc-text-field-helper-line">
    <div
      aria-hidden="true"
      class="mdc-text-field-helper-text"
    >
      <slot name="helperText" />
    </div>
    <slot name="characterCounter" />
  </div>
{/if}
