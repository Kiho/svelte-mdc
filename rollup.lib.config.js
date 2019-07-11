import svelte from "rollup-plugin-svelte";
import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
// import { terser } from "rollup-plugin-terser";
import sass from 'node-sass';

const production = false;
const pack = require('./package.json');
const buildDir = 'dist';

console.log('production', production);

export default [
	{
		input: './src/index.js',	
		output:[
			{	
				sourcemap: true,
				format: "esm",
				file: pack.module,
				name: 'svelte-mdc',
			}
    ],
    externals: Object.keys(pack.peerDependencies).concat('encoding'),
    onwarn: (warning, handler) => {
      // e.g. don't warn on <marquee> elements, cos they're cool
      if (warning.code === 'a11y-distracting-elements') return;

      // let Rollup handle all other warnings normally
      handler(warning);
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
      resolve(),
      commonjs(),
			// production && buble({ exclude: 'node_modules/**', transforms: { forOf: false } }),
			// production && uglify()
		]
	},
];