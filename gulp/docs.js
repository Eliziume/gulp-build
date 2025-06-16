const gulp = require('gulp');
const replace = require('gulp-replace');

// HTML
const fileInclude = require('gulp-file-include');
const htmlclean = require('gulp-htmlclean');
const webpHTML = require('gulp-webp-retina-html');
const typograf = require('gulp-typograf');

// SASS
const sass = require('gulp-sass')(require('sass'));
const sassGlob = require('gulp-sass-glob');
const autoprefixer = require('gulp-autoprefixer');
const csso = require('gulp-csso');
// const webImagesCSS = require('gulp-web-images-css');  //Вывод WEBP-изображений

const server = require('gulp-server-livereload');
const clean = require('gulp-clean');
const fs = require('fs');
const sourceMaps = require('gulp-sourcemaps');
const groupMedia = require('gulp-group-css-media-queries');
const plumber = require('gulp-plumber');
const notify = require('gulp-notify');
const webpack = require('webpack-stream');
const babel = require('gulp-babel');
const changed = require('gulp-changed');
const filter = require('gulp-filter')
const extReplace = require('gulp-ext-replace');

// Images
const imagemin = require('gulp-imagemin');
const imageminWebp = require('imagemin-webp');
const imageminAvif = require('imagemin-avif'); // Добавляем AVIF плагин
// const rename = require('gulp-rename');

// SVG
const svgsprite = require('gulp-svg-sprite');

gulp.task('clean:docs', function (done) {
  if (fs.existsSync('./docs/')) {
    return gulp
      .src('./docs/', {
        read: false
      })
      .pipe(clean({
        force: true
      }));
  }
  done();
});

const fileIncludeSetting = {
  prefix: '@@',
  basepath: '@file',
};

const plumberNotify = (title) => {
  return {
    errorHandler: notify.onError({
      title: title,
      message: 'Error <%= error.message %>',
      sound: false,
    }),
  };
};

gulp.task('html:docs', function () {
  return (
    gulp
    // .src(['./src/html/**/*.html', '!./src/html/blocks/*.html'])
    .src([
      './src/html/**/*.html',
      '!./**/blocks/**/*.*',
      '!./src/html/docs/**/*.*',
    ])
    .pipe(changed('./docs/'))
    .pipe(plumber(plumberNotify('HTML')))
    .pipe(fileInclude(fileIncludeSetting))
    .pipe(
      replace(/<img(?:.|\n|\r)*?>/g, function (match) {
        return match
          .replace(/\r?\n|\r/g, '')
          .replace(/\s{2,}/g, ' ');
      })
    ) //удаляет лишние пробелы и переводы строк внутри тега <img>
    .pipe(
      replace(
        /(?<=src=|href=|srcset=)(['"])(\.(\.)?\/)*(img|images|fonts|css|scss|sass|js|files|audio|video)(\/[^\/'"]+(\/))?([^'"]*)\1/gi,
        '$1./$4$5$7$1'
      )
    )
    .pipe(
      typograf({
        locale: ['ru', 'en-US'],
        htmlEntity: {
          type: 'digit'
        },
        safeTags: [
          ['<\\?php', '\\?>'],
          ['<no-typography>', '</no-typography>'],
        ],
      })
    )
    // Оптимизация <img> (WebP + AVIF + Retina)
    .pipe(
      replace(
        /<img(.*?)src="(.*?)\.(jpg|jpeg|png|gif)"(.*?)>/gi,
        (match, p1, p2, p3, p4) => `
          <picture>
            <source srcset="${p2}.avif 1x, ${p2}@2x.avif 2x" type="image/avif">
            <source srcset="${p2}.webp 1x, ${p2}@2x.webp 2x" type="image/webp">
            <source srcset="${p2}.${p3} 1x, ${p2}@2x.${p3} 2x" type="image/${p3 === 'jpg' ? 'jpeg' : p3}">
            <img ${p1}src="${p2}.${p3}"${p4}>
          </picture>
        `
      )
    )
    .pipe(htmlclean())
    .pipe(gulp.dest('./docs/'))
  );
});

gulp.task('sass:docs', function () {
  return (
    gulp
    .src('./src/scss/*.scss')
    .pipe(changed('./docs/css/'))
    .pipe(plumber(plumberNotify('SCSS')))
    .pipe(sourceMaps.init())
    .pipe(sassGlob()) /* Первый */
    .pipe(sass()) /* Второй */
    .pipe(autoprefixer()) /* После SASS обработка CSS */
    .pipe(groupMedia())
    // .pipe(
    // 	webImagesCSS({
    // 		mode: 'webp',
    // 	})
    // )
    .pipe(
      replace(
        /(['"]?)(\.\.\/)+(img|images|fonts|css|scss|sass|js|files|audio|video)(\/[^\/'"]+(\/))?([^'"]*)\1/gi,
        '$1$2$3$4$6$1'
      )
    )
    .pipe(csso())
    .pipe(sourceMaps.write())
    .pipe(gulp.dest('./docs/css/'))
  );
});


gulp.task('images:docs', function (done) {
  // Создаем счетчик для отслеживания завершения всех потоков
  let completedStreams = 0;
  const totalStreams = 4; // Оригиналы + WebP + AVIF + SVG

  function checkCompletion() {
    completedStreams++;
    if (completedStreams === totalStreams) {
      done();
    }
  }

  // 1. Обработка оригинальных изображений (JPG/PNG/GIF)
  gulp.src(['./src/img/**/*', '!./src/img/svgicons/**/*'])
    .pipe(plumber())
    .pipe(filter(['**/*.{jpg,jpeg,png,gif}']))
    .pipe(changed('./docs/img/'))
    .pipe(imagemin([
      imagemin.mozjpeg({
        quality: 85
      }),
      imagemin.optipng({
        optimizationLevel: 5
      })
    ]))
    .pipe(gulp.dest('./docs/img/'))
    .on('end', checkCompletion);

  // 2. Конвертация в WebP
  gulp.src(['./src/img/**/*', '!./src/img/svgicons/**/*'])
    .pipe(plumber())
    .pipe(filter(['**/*.{jpg,jpeg,png,gif}']))
    .pipe(changed('./docs/img/', {
      extension: '.webp'
    }))
    .pipe(imagemin([imageminWebp({
      quality: 85
    })]))
    .pipe(extReplace('.webp'))
    .pipe(gulp.dest('./docs/img/'))
    .on('end', checkCompletion);

  // 3. Конвертация в AVIF (включая @2x)
  gulp.src(['./src/img/**/*', '!./src/img/svgicons/**/*'])
    .pipe(plumber())
    .pipe(filter(['**/*.{jpg,jpeg,png,gif}']))
    .pipe(changed('./docs/img/', {
      extension: '.avif'
    }))
    .pipe(imagemin([imageminAvif({
      quality: 60,
      speed: 6
    })]))
    .pipe(extReplace('.avif'))
    .pipe(gulp.dest('./docs/img/'))
    .on('end', checkCompletion);

  // 4. Копирование SVG
  gulp.src('./src/img/**/*.svg')
    .pipe(plumber())
    .pipe(changed('./docs/img/'))
    .pipe(gulp.dest('./docs/img/'))
    .on('end', checkCompletion);
});


const svgStack = {
  mode: {
    stack: {
      example: true,
    },
  },
};

const svgSymbol = {
  mode: {
    symbol: {
      sprite: '../sprite.symbol.svg',
    },
  },
  shape: {
    transform: [{
      svgo: {
        plugins: [{
          name: 'removeAttrs',
          params: {
            attrs: '(fill|stroke)',
          },
        }, ],
      },
    }, ],
  },
};

gulp.task('svgStack:docs', function () {
  return gulp
    .src('./src/img/svgicons/**/*.svg')
    .pipe(plumber(plumberNotify('SVG:dev')))
    .pipe(svgsprite(svgStack))
    .pipe(gulp.dest('./docs/img/svgsprite/'));
});

gulp.task('svgSymbol:docs', function () {
  return gulp
    .src('./src/img/svgicons/**/*.svg')
    .pipe(plumber(plumberNotify('SVG:dev')))
    .pipe(svgsprite(svgSymbol))
    .pipe(gulp.dest('./docs/img/svgsprite/'));
});

gulp.task('files:docs', function () {
  return gulp
    .src('./src/files/**/*')
    .pipe(changed('./docs/files/'))
    .pipe(gulp.dest('./docs/files/'));
});

gulp.task('js:docs', function () {
  return gulp
    .src('./src/js/*.js')
    .pipe(changed('./docs/js/'))
    .pipe(plumber(plumberNotify('JS')))
    .pipe(babel())
    .pipe(webpack(require('./../webpack.config.js')))
    .pipe(gulp.dest('./docs/js/'));
});

const serverOptions = {
  livereload: true,
  open: true,
};

gulp.task('server:docs', function () {
  return gulp.src('./docs/').pipe(server(serverOptions));
});