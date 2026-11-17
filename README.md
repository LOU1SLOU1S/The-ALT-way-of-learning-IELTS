# The Alternative Way of learning IELTS

Open `index.html` in a browser or serve this folder on a static web host. The site includes its styles, icons and practice bank. The daily refresh runs in the browser and needs no account, server job or API key.

At local midnight, the study desk advances its independent reading, vocabulary, conversation and quiz activities. Seven original readings rotate weekly. Each reading answer cites a sentence in the passage. Quiz attempts resume on the same day, and an open exercise can be finished across midnight.

The site checks BBC Learning English’s **6 Minute English** and **The English We Speak** feeds daily. It links to the publisher’s lessons and transcripts, features new episodes on their release dates, and rotates archive lessons between releases. If a feed is unavailable, the site uses its cached catalogue or a built-in selection. External lessons and dictionary recordings need internet access.

Choose Nyx, Roxy, Selene or Ivy on the study desk. Hear the tutor’s greeting, then use the same tutor in UK or US English for vocabulary, flashcards, conversation and quizzes. All built-in lessons and tutor lines include local recordings. On a graded activity, **Hear feedback** plays an original coaching line. The study desk also offers optional “good boy” praise for correct vocabulary quiz answers.

New words and examples you add use [Kokoro](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) to generate the same tutor’s voice on your device. First use downloads roughly 116 MB of voice software plus a small profile for each tutor and accent you try. The browser can reuse these downloads while its cache is available. Vocabulary cards also link to Cambridge Dictionary’s UK and US pronunciation references.

The recording script in `scripts/render-tutor-audio.py` builds the lesson catalogue and MP3s from the curriculum and tutor scripts. After changing only the tutor lines, use its `--lines-only` option with the voice model folder.

Run the curriculum and progression checks with `node --test tests/practice.test.cjs`.
