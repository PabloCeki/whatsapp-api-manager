import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { createGzip } from 'zlib';
import archiver from 'archiver';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Crear directorio temporal para la compilación
const tempDir = path.join(__dirname, 'temp_build');
if (fs.existsSync(tempDir)) {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
fs.mkdirSync(tempDir, { recursive: true });

// Configuración de esbuild
async function build() {
  try {
    const result = await esbuild.build({
      entryPoints: ['src/deliveries/lambda/index.mjs'],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs', // Cambiado de 'esm' a 'cjs' para compatibilidad con AWS Lambda
      outfile: path.join(tempDir, 'index.js'),
      minify: true,
      treeShaking: true,
      external: [
        // Excluir módulos que AWS Lambda ya proporciona
        'aws-sdk',
        // Dependencias opcionales de @whiskeysockets/baileys (dinámicamente importadas)
        'jimp',
        'sharp',
        'link-preview-js',
      ],
      metafile: true,
    });

    console.log('Build completed successfully');

    // Crear archivo zip para AWS Lambda
    const output = fs.createWriteStream(
      path.join(__dirname, 'lambda-function.zip'),
    );
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Nivel de compresión
    });

    output.on('close', () => {
      console.log(`Archive created: ${archive.pointer()} total bytes`);
    });

    archive.on('error', (err) => {
      throw err;
    });

    archive.pipe(output);

    // Agregar el archivo index.js compilado dentro de la estructura /src/lambda/
    archive.file(path.join(tempDir, 'index.js'), {
      name: 'src/lambda/index.js',
    });

    // Agregar package.json y package-lock.json
    // No necesitamos agregar el package-lock.json

    // Función para determinar si un archivo debe ser excluido
    const shouldExcludeFile = (filePath) => {
      const skipPatterns = [
        /\.git/,
        /\.github/,
        /test/,
        /tests/,
        /docs/,
        /examples/,
        /\.md$/,
        /LICENSE/,
        /\.ts$/,
        /\.map$/,
        /\.d\.ts$/,
        /\.c$/,
        /\.cpp$/,
        /\.h$/,
        /\.o$/,
        /\.gyp$/,
        /\.travis\.yml$/,
        /\.eslintrc/,
        /\.npmignore/,
        /\.editorconfig/,
        /\.prettierrc/,
        /\.gitattributes/,
        /\.DS_Store/,
        /Makefile/,
        /\.vscode/,
        /\.idea/,
      ];

      return skipPatterns.some((pattern) => pattern.test(filePath));
    };

    // Crear un package.json reducido solo con dependencias de producción
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const prodPackageJson = {
      name: packageJson.name,
      version: packageJson.version,
      main: 'src/lambda/index.js',
      type: 'commonjs', // Especificar explícitamente que usamos CommonJS
      dependencies: packageJson.dependencies,
    };

    // Escribir el package.json optimizado al archivo temporal
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify(prodPackageJson, null, 2),
    );

    // Agregar el package.json optimizado
    archive.file(path.join(tempDir, 'package.json'), { name: 'package.json' });

    // Función para agregar dependencias de producción
    // Usamos npm list para obtener las dependencias reales instaladas
    const prodDepsOutput = execSync('npm list --prod --json', {
      encoding: 'utf8',
    });
    const prodDepsInfo = JSON.parse(prodDepsOutput);

    // Función recursiva para agregar dependencias
    const addDependencyToArchive = (depName, depPath) => {
      if (fs.existsSync(depPath) && fs.statSync(depPath).isDirectory()) {
        // Excluir archivos innecesarios
        const files = fs.readdirSync(depPath, { withFileTypes: true });

        for (const file of files) {
          const filePath = path.join(depPath, file.name);
          const archivePath = `node_modules/${depPath.substring(
            depPath.indexOf('node_modules/') + 13,
          )}/${file.name}`;

          if (file.isDirectory()) {
            // Si es un directorio, procesar recursivamente
            if (!shouldExcludeFile(file.name)) {
              addDependencyToArchive(file.name, filePath);
            }
          } else {
            // Si es un archivo y no debe ser excluido, añadirlo al archivo
            if (!shouldExcludeFile(file.name)) {
              archive.file(filePath, { name: archivePath });
            }
          }
        }
      }
    };

    // Agregar solo las dependencias de producción necesarias
    const requiredDeps = ['ethers', 'config', 'dotenv', 'uuid', 'jsonwebtoken'];

    for (const dep of requiredDeps) {
      const depPath = path.join('node_modules', dep);
      if (fs.existsSync(depPath)) {
        addDependencyToArchive(dep, depPath);
      }
    }

    // Incluir los directorios key y config en el zip
    if (fs.existsSync('key')) {
      archive.directory('key', 'key');
    }

    if (fs.existsSync('config')) {
      archive.directory('config', 'config');
    }

    // Finalizar el archivo
    await archive.finalize();

    // Limpiar directorio temporal
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
