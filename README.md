# Desafio Calculo Mental

Aplicacion movil desarrollada con Expo, React Native y TypeScript para el trabajo de Desarrollo de Aplicaciones I.

## Funcionalidades

- Configuracion de dificultad: facil, medio y dificil.
- Modos de juego: clasico, verdadero/falso, multiple choice y contra reloj.
- Operaciones generadas dinamicamente segun dificultad.
- Cantidad de iteraciones configurable para rondas no continuas.
- Timer por operacion y timer total para modo contra reloj.
- Puntaje por precision y velocidad:
  - Correcta rapida: +100 puntos.
  - Correcta dentro del tiempo: +70 puntos.
  - Incorrecta: -30 puntos.
  - Sin respuesta: -50 puntos.
- Historial, mejores puntajes y estadisticas persistidas localmente con AsyncStorage.
- Estadisticas visuales sin conexion a internet ni backend.

## Ejecutar

```bash
npm install
npm run web
```

Tambien se puede ejecutar en Expo Go con:

```bash
npm start
```

## Entrega

El documento `Descripcion_Funcionalidades.docx` resume las funcionalidades implementadas y decisiones de diseno.
