<script>
  import { TextField } from '../components';
  import { Checkbox } from '../components';

  export let name = '';
  export let text = '';
  export let outlined = true;
  export let disabled = false;

	// function iconEvent(value) {
  //   console.log('IconToggle clicked', value);
  // }
</script>

TextField
<TextField bind:value={text} {outlined} {disabled} />

outlined
<Checkbox bind:checked={outlined} />
disabled
<Checkbox bind:checked={disabled} />

<div class="mdc-text-field text-field mdc-text-field--outlined">
  <input type="text" id="text-field-outlined-cc1" class="mdc-text-field__input" maxlength="18" aria-describedby="text-field-outlined-cc1-helper-text">
  <div class="mdc-notched-outline mdc-notched-outline--upgraded">
    <div class="mdc-notched-outline__leading"></div>
      <div class="mdc-notched-outline__notch" style="">
        <label class="mdc-floating-label" for="text-field-outlined-cc1" style="">Standard</label>
      </div>
    <div class="mdc-notched-outline__trailing"></div>
  </div>
</div>