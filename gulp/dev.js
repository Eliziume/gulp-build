const gulp = require('gulp');
const fileInclude = require('gulp-file-include');
const sass = require('gulp-sass')(require('sass'));
const sassGlob = require('gulp-sass-glob');
const server = require('gulp-server-livereload');
const clean = require('gulp-clean');
const fs = require('fs');
const sourceMaps = require('gulp-sourcemaps');
const plumber = require('gulp-plumber');
const notify = require('gulp-notify');
const webpack = require('webpack-stream');
const babel = require('gulp-babel');
const imagemin = require('gulp-imagemin');
const changed = require('gulp-changed');
const typograf = require('gulp-typograf');
const svgsprite = require('gulp-svg-sprite');
const replace = require('gulp-replace');
const webpHTML = require('gulp-webp-retina-html');
const imageminWebp = require('imagemin-webp');
const imageminAvif = require('imagemin-avif'); // Добавляем AVIF плагин
const rename = require('gulp-rename');
const prettier = require('@bdchauvette/gulp-prettier');
const filter = require('gulp-filter')
const extReplace = require('gulp-ext-replace');


gulp.task('clean:dev', function (done) {
  if (fs.existsSync('./build/')) {
    return gulp
      .src('./build/', {
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

gulp.task('html:dev', function () {
  return gulp
    .src([
      './src/html/**/*.html',
      '!./**/blocks/**/*.*',
      '!./src/html/docs/**/*.*',
    ])
    .pipe(changed('./build/', {
      hasChanged: changed.compareContents
    }))
    .pipe(plumber(plumberNotify('HTML')))
    .pipe(fileInclude(fileIncludeSetting))
    .pipe(
      replace(/<img(?:.|\n|\r)*?>/g, function (match) {
        return match.replace(/\r?\n|\r/g, '').replace(/\s{2,}/g, ' ');
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
    .pipe(
      prettier({
        tabWidth: 4,
        useTabs: true,
        printWidth: 182,
        trailingComma: 'es5',
        bracketSpacing: false,
      })
    )
    .pipe(gulp.dest('./build/'));
});

gulp.task('sass:dev', function () {
  return gulp
    .src('./src/scss/*.scss')
    .pipe(changed('./build/css/'))
    .pipe(plumber(plumberNotify('SCSS')))
    .pipe(sourceMaps.init())
    .pipe(sassGlob())
    .pipe(sass())
    .pipe(
      replace(
        /(['"]?)(\.\.\/)+(img|images|fonts|css|scss|sass|js|files|audio|video)(\/[^\/'"]+(\/))?([^'"]*)\1/gi,
        '$1$2$3$4$6$1'
      )
    )
    .pipe(sourceMaps.write())
    .pipe(gulp.dest('./build/css/'));
});

gulp.task('images:dev', function (done) {
  // Создаем отдельные потоки для каждого типа обработки
  const processOriginal = () => {
    return gulp.src(['./src/img/**/*', '!./src/img/svgicons/**/*'])
      .pipe(filter(['**/*.{jpg,jpeg,png,gif}']))
      .pipe(changed('./build/img/'))
      .pipe(imagemin([
        imagemin.mozjpeg({
          quality: 85
        }),
        imagemin.optipng({
          optimizationLevel: 5
        })
      ]))
      .pipe(gulp.dest('./build/img/'));
  };

  const processWebP = () => {
    return gulp.src(['./src/img/**/*', '!./src/img/svgicons/**/*'])
      .pipe(filter(['**/*.{jpg,jpeg,png,gif}']))
      .pipe(changed('./build/img/', {
        extension: '.webp'
      }))
      .pipe(imagemin([imageminWebp({
        quality: 85
      })]))
      .pipe(extReplace('.webp'))
      .pipe(gulp.dest('./build/img/'));
  };

  const processAVIF = () => {
    return gulp.src(['./src/img/**/*', '!./src/img/svgicons/**/*'])
      .pipe(filter(['**/*.{jpg,jpeg,png,gif}']))
      .pipe(changed('./build/img/', {
        extension: '.avif'
      }))
      .pipe(imagemin([imageminAvif({
        quality: 60,
        speed: 6
      })]))
      .pipe(extReplace('.avif'))
      .pipe(gulp.dest('./build/img/'));
  };

  const processSVG = () => {
    return gulp.src('./src/img/**/*.svg')
      .pipe(changed('./build/img/'))
      .pipe(gulp.dest('./build/img/'));
  };

  // Запускаем все потоки параллельно и ждем их завершения
  const streams = [
    processOriginal().on('end', () => console.log('Original images processed')),
    processWebP().on('end', () => console.log('WebP images processed')),
    processAVIF().on('end', () => console.log('AVIF images processed')),
    processSVG().on('end', () => console.log('SVG images processed'))
  ];

  // Используем merge-stream для правильного завершения задачи
  const merge = require('merge-stream');
  return merge(streams).on('finish', done);
});

const svgStack = {
  mode: {
    stack: {
      example: true,
    },
  },
  shape: {
    transform: [{
      svgo: {
        js2svg: {
          indent: 4,
          pretty: true
        },
      },
    }, ],
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
        js2svg: {
          indent: 4,
          pretty: true
        },
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

gulp.task('svgStack:dev', function () {
  return gulp
    .src('./src/img/svgicons/**/*.svg')
    .pipe(plumber(plumberNotify('SVG:dev')))
    .pipe(svgsprite(svgStack))
    .pipe(gulp.dest('./build/img/svgsprite/'))
});

gulp.task('svgSymbol:dev', function () {
  return gulp
    .src('./src/img/svgicons/**/*.svg')
    .pipe(plumber(plumberNotify('SVG:dev')))
    .pipe(svgsprite(svgSymbol))
    .pipe(gulp.dest('./build/img/svgsprite/'));
});

gulp.task('files:dev', function () {
  return gulp
    .src('./src/files/**/*')
    .pipe(changed('./build/files/'))
    .pipe(gulp.dest('./build/files/'));
});

gulp.task('js:dev', function () {
  return gulp
    .src('./src/js/*.js')
    .pipe(changed('./build/js/'))
    .pipe(plumber(plumberNotify('JS')))
    // .pipe(babel())
    .pipe(webpack(require('./../webpack.config.js')))
    .pipe(gulp.dest('./build/js/'));
});

const serverOptions = {
  livereload: true,
  open: true,
};

gulp.task('server:dev', function () {
  return gulp.src('./build/').pipe(server(serverOptions));
});

gulp.task('watch:dev', function () {
  gulp.watch('./src/scss/**/*.scss', gulp.parallel('sass:dev'));
  gulp.watch(
    ['./src/html/**/*.html', './src/html/**/*.json'],
    gulp.parallel('html:dev')
  );
  gulp.watch('./src/img/**/*', gulp.parallel('images:dev'));
  gulp.watch('./src/files/**/*', gulp.parallel('files:dev'));
  gulp.watch('./src/js/**/*.js', gulp.parallel('js:dev'));
  gulp.watch(
    './src/img/svgicons/*',
    gulp.series('svgStack:dev', 'svgSymbol:dev')
  );
});