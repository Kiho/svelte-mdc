import svelte from "rollup-plugin-svelte";
import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import { terser } from "rollup-plugin-terser";
import sass from 'node-sass';

const production = !process.env.ROLLUP_WATCH;
const buildDir = production ? 'dist' : 'public/dist';

export default [
  {
    input: 'src/main.js', 
    output: {
      sourcemap: !production,  
      format: 'iife',
      file: `${buildDir}/bundle.js`,
      name: 'app'
    },
    plugins: [
      svelte({
        // enable run-time checks when not in production
        dev: !production,
        // we'll extract any component CSS out into
        // a separate file — better for performance
        css: css => {
          css.write(`${buildDir}/bundle.css`);
        },

        preprocess: {
          style: ({ content, attributes }) => {
            if (attributes.type !== 'text/scss') return;

            return new Promise((fulfill, reject) => {
              sass.render({
                data: content,
                includePaths: ['src', 'node_modules'],
                sourceMap: true,
                outFile: 'x' // this is necessary, but is ignored
              }, (err, result) => {
                if (err) return reject(err);

                fulfill({
                  code: result.css.toString(),
                  map: result.map.toString()
                });
              });
            });
          }
        }
      }),

      // If you have external dependencies installed from
      // npm, you'll most likely need these plugins. In
      // some cases you'll need additional configuration —
      // consult the documentation for details:
      // https://github.com/rollup/rollup-plugin-commonjs
      resolve(),
      commonjs(),

      production && terser()
    ],
    watch: {
      clearScreen: false
    }
  },

  // drawers
  {
    input: 'src/frames/drawer.js',
    output: {
      sourcemap: !production,  
      file: `${buildDir}/drawer.js`,
      format: 'iife',
      name: 'drawer'
    },
    plugins: [
      resolve(),
      commonjs({
        namedExports: {
          svelte: ['create', 'compile']
        }
      }),
      svelte({
        dev: !production,
      }),
      production && terser()
    ]
  },
  // textField
  {
    input: 'src/frames/text-field.js',
    output: {
      sourcemap: !production,  
      file: `${buildDir}/text-field.js`,
      format: 'iife',
      name: 'textField'
    },
    plugins: [
      commonjs({
        namedExports: {
          svelte: ['create', 'compile']
        }
      }),
      svelte({
        dev: !production,
      }),
      resolve(),
    ]
  }
];